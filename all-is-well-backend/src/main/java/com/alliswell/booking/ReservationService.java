package com.alliswell.booking;

import static com.alliswell.booking.BookingState.Status.ADMITTED;
import static com.alliswell.booking.BookingState.Status.COMPLETED;
import static com.alliswell.booking.BookingState.Status.WAITING;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.GONE;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import com.alliswell.booking.BookingState.Hold;
import com.alliswell.booking.BookingState.Quote;
import com.alliswell.booking.BookingState.Receipt;
import com.alliswell.booking.BookingState.Status;
import com.alliswell.booking.BookingState.Ticket;
import com.alliswell.flights.FlightOfferCatalog;
import com.alliswell.traffic.ReservationEvents;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
class ReservationService {

    private static final Pattern FLIGHT_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,79}");
    private static final Pattern SEAT = Pattern.compile("[1-9][0-9]?[A-F]");
    private static final long REQUEST_WINDOW_MS = 60_000L;

    private final BookingStorage storage;
    private final BookingProperties properties;
    private final ReservationEvents events;
    private final Clock clock;

    @Autowired
    ReservationService(BookingStorage storage, BookingProperties properties, ReservationEvents events) {
        this(storage, properties, events, Clock.systemUTC());
    }

    ReservationService(BookingStorage storage, BookingProperties properties,
                       ReservationEvents events, Clock clock) {
        this.storage = storage;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    QueueView join() {
        return join(null);
    }

    QueueView join(String owner) {
        return update("QUEUE_JOIN", owner, null, false, (state, token, ticket, now) -> {
            if (owner != null) {
                for (var entry : state.tickets().entrySet()) {
                    Ticket existing = entry.getValue();
                    if (owner.equals(existing.owner()) && existing.status() != COMPLETED) {
                        QueueView view = queueView(state, entry.getKey());
                        return new Action<>(view, existing.sessionId(), view.state().name());
                    }
                }
            }
            long count = state.tickets().values().stream()
                    .filter(existing -> managed(owner) == managed(existing.owner()))
                    .count();
            if (count >= properties.maxSessions()) {
                throw new ReservationException(TOO_MANY_REQUESTS, "QUEUE_FULL", "대기열이 가득 찼어요.");
            }
            String queueToken = UUID.randomUUID().toString();
            Ticket waiting = new Ticket(UUID.randomUUID().toString(), owner, WAITING,
                    now + properties.queueTtl().toMillis(), 0, 0);
            state.tickets().put(queueToken, waiting);
            admitWaiting(state, managed(owner), now);
            QueueView view = queueView(state, queueToken);
            return new Action<>(view, waiting.sessionId(), view.state().name());
        });
    }

    QueueView status(String queueToken) {
        return status(null, queueToken);
    }

    QueueView status(String owner, String queueToken) {
        return withTicket("QUEUE_STATUS", owner, queueToken, (state, token, ticket, now) -> {
            QueueView view = queueView(state, token);
            return new Action<>(view, ticket.sessionId(), view.state().name());
        });
    }

    HoldView hold(String queueToken, String flightKey, List<String> seats) {
        return withTicket("SEAT_HOLD", null, queueToken, (state, token, ticket, now) -> {
            requireAdmission(ticket);
            String flight = normalizeFlight(flightKey);
            List<String> requested = normalizeSeats(seats);
            Hold hold = createHold(state, ticket, flight, requested, null, now);
            return new Action<>(holdView(hold), ticket.sessionId(), "HELD");
        });
    }

    HoldPriceView hold(String owner, String queueToken, String offerId,
                       List<String> seats, Supplier<FlightOfferCatalog.Offer> loadOffer) {
        return withTicket("SEAT_HOLD", owner, queueToken, (state, token, ticket, now) -> {
            requireAdmission(ticket);
            List<String> requested = normalizeSeats(seats);
            Hold existing = currentHold(state, ticket);
            if (existing != null) {
                if (existing.quote().offerId().equals(offerId) && existing.seats().equals(requested)) {
                    return new Action<>(holdPriceView(existing), ticket.sessionId(), "HELD");
                }
                throw new ReservationException(CONFLICT, "HOLD_EXISTS", "기존 좌석 선점을 먼저 해제해 주세요.");
            }
            var offer = loadOffer.get();
            requireFutureFlight(offer, now);
            if (requested.size() != offer.passengers() || !offer.seats().keySet().containsAll(requested)) {
                throw new ReservationException(BAD_REQUEST, "INVALID_SEATS", "인원수와 선택 가능한 좌석 번호를 확인해 주세요.");
            }
            BigDecimal seatFee = requested.stream()
                    .map(seat -> BigDecimal.valueOf(offer.seats().get(seat)))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Quote quote = new Quote(offer.id(), offer.kind(), offer.flightId(), offer.airline(),
                    offer.flightNums(), offer.route(), offer.date(), offer.depTime(), offer.arrTime(),
                    offer.dayDiff(), offer.durationMin(), offer.cabin(), offer.passengers(), offer.fare(),
                    seatFee, offer.currency(), offer.departureAt().toEpochMilli());
            Hold hold = createHold(state, ticket, offer.flightKey(), requested, quote, now);
            return new Action<>(holdPriceView(hold), ticket.sessionId(), "HELD");
        });
    }

    AvailabilityView availability(String owner, String queueToken,
                                  Supplier<FlightOfferCatalog.Offer> loadOffer) {
        return withTicket("SEAT_AVAILABILITY", owner, queueToken, (state, token, ticket, now) -> {
            requireAdmission(ticket);
            var offer = loadOffer.get();
            requireFutureFlight(offer, now);
            TreeSet<String> occupied = occupiedSeats(state, offer.flightKey(), true, ticket.sessionId());
            occupied.retainAll(offer.seats().keySet());
            return new Action<>(new AvailabilityView(List.copyOf(occupied), Map.copyOf(offer.seats())),
                    ticket.sessionId(), "AVAILABLE");
        });
    }

    void withdraw(String owner, String queueToken) {
        update("QUEUE_WITHDRAW", owner, queueToken, false, (state, token, ticket, now) -> {
            if (ticket == null || ticket.status() == COMPLETED) {
                return new Action<>(null, null, null);
            }
            state.tickets().remove(token);
            state.holds().values().removeIf(hold -> hold.sessionId().equals(ticket.sessionId()));
            admitWaiting(state, managed(owner), now);
            return new Action<>(null, ticket.sessionId(), "WITHDRAWN");
        });
    }

    List<BookingView> bookings(String owner) {
        return update("BOOKING_LIST", owner, null, false, (state, token, ticket, now) -> {
            List<BookingView> bookings = state.receipts().values().stream()
                    .filter(receipt -> owner.equals(receipt.owner()))
                    .sorted(Comparator.comparingLong(Receipt::confirmedAt).reversed()
                            .thenComparing(Receipt::reservationId))
                    .map(receipt -> bookingView(receipt, now))
                    .toList();
            return new Action<>(bookings, null, null);
        });
    }

    BookingView cancel(String owner, String code) {
        return update("BOOKING_CANCEL", owner, null, false, (state, token, ticket, now) -> {
            for (var entry : state.receipts().entrySet()) {
                Receipt receipt = entry.getValue();
                if (!owner.equals(receipt.owner()) || !code.equals(receipt.reservationId())) {
                    continue;
                }
                if (receipt.canceledAt() != null) {
                    return new Action<>(bookingView(receipt, now), receipt.sessionId(), "ALREADY_CANCELED");
                }
                if (receipt.quote().departureAt() <= now) {
                    throw new ReservationException(CONFLICT, "CANCELLATION_CLOSED", "출발 시간이 지나 취소할 수 없어요.");
                }
                Receipt canceled = receipt.canceled(now);
                entry.setValue(canceled);
                return new Action<>(bookingView(canceled, now), receipt.sessionId(), "CANCELED");
            }
            throw new ReservationException(NOT_FOUND, "BOOKING_NOT_FOUND", "예약 내역을 찾을 수 없어요.");
        });
    }

    void release(String queueToken, String holdId) {
        release(null, queueToken, holdId);
    }

    void release(String owner, String queueToken, String holdId) {
        withTicket("SEAT_RELEASE", owner, queueToken, (state, token, ticket, now) -> {
            requireAdmission(ticket);
            requireHold(state, holdId, ticket);
            state.holds().remove(holdId);
            return new Action<>(null, ticket.sessionId(), "RELEASED");
        });
    }

    ReceiptView confirm(String queueToken, String holdId) {
        return receiptView(confirmReceipt(null, queueToken, holdId));
    }

    BookingView confirm(String owner, String queueToken, String holdId) {
        return bookingView(confirmReceipt(owner, queueToken, holdId), clock.millis());
    }

    private Receipt confirmReceipt(String owner, String queueToken, String holdId) {
        return withTicket("BOOKING_CONFIRM", owner, queueToken, (state, token, ticket, now) -> {
            Receipt existing = state.receipts().get(holdId);
            if (existing != null && existing.sessionId().equals(ticket.sessionId())) {
                return new Action<>(existing, ticket.sessionId(), "ALREADY_CONFIRMED");
            }
            requireAdmission(ticket);
            Hold hold = requireHold(state, holdId, ticket);
            long count = state.receipts().values().stream()
                    .filter(receipt -> managed(receipt.owner()) == managed(owner))
                    .count();
            if (count >= properties.maxReservations()) {
                throw new ReservationException(CONFLICT, "BOOKING_LIMIT", "모의 예약 저장 한도에 도달했어요.");
            }
            Receipt receipt = new Receipt(UUID.randomUUID().toString(), ticket.sessionId(),
                    hold.flightKey(), hold.seats(), now, owner, hold.quote(), null);
            state.receipts().put(holdId, receipt);
            state.holds().remove(holdId);
            state.tickets().put(token, ticket.withStatus(COMPLETED, now + properties.receiptTtl().toMillis()));
            admitWaiting(state, managed(owner), now);
            return new Action<>(receipt, ticket.sessionId(), "CONFIRMED");
        });
    }

    private <T> T withTicket(String action, String owner, String queueToken, Operation<T> operation) {
        return update(action, owner, queueToken, true, operation);
    }

    private <T> T update(String action, String owner, String queueToken,
                         boolean requiresTicket, Operation<T> operation) {
        Result<T> result = storage.update(state -> {
            long now = clock.millis();
            List<Signal> signals = new ArrayList<>();
            expire(state, signals, now);
            admitWaiting(state, managed(owner), now);

            Ticket ticket = state.tickets().get(queueToken);
            if (ticket != null && !Objects.equals(ticket.owner(), owner)) {
                ticket = null;
            }
            try {
                if (requiresTicket) {
                    if (ticket == null) {
                        throw new ReservationException(UNAUTHORIZED, "QUEUE_TOKEN_INVALID",
                                "유효한 대기열 토큰이 필요해요.");
                    }
                    ticket = countRequest(state, queueToken, ticket, now);
                }
                Action<T> performed = operation.run(state, queueToken, ticket, now);
                if (performed.sessionId() != null) {
                    signals.add(new Signal(performed.sessionId(), action, performed.outcome()));
                }
                return new Result<>(performed.value(), null, signals);
            } catch (ReservationException exception) {
                if (ticket != null) {
                    signals.add(new Signal(ticket.sessionId(), action, exception.code()));
                }
                return new Result<>(null, exception, signals);
            }
        });
        for (Signal signal : result.signals()) {
            events.record(signal.sessionId(), signal.action(), signal.outcome());
        }
        if (result.failure() != null) {
            throw result.failure();
        }
        return result.value();
    }

    private Ticket countRequest(BookingState state, String token, Ticket ticket, long now) {
        if (now - ticket.requestWindowStart() < REQUEST_WINDOW_MS && ticket.requests() >= properties.requestLimit()) {
            throw new ReservationException(TOO_MANY_REQUESTS, "RATE_LIMITED", "요청이 많아요. 잠시 후 다시 시도해 주세요.");
        }
        Ticket updated = ticket.withRequest(now, REQUEST_WINDOW_MS);
        state.tickets().put(token, updated);
        return updated;
    }

    private void expire(BookingState state, List<Signal> signals, long now) {
        state.tickets().values().removeIf(ticket -> ticket.expiresAt() <= now);
        state.holds().values().removeIf(hold -> {
            if (hold.expiresAt() > now) {
                return false;
            }
            signals.add(new Signal(hold.sessionId(), "HOLD_EXPIRED", "EXPIRED"));
            return true;
        });
    }

    private void admitWaiting(BookingState state, boolean managed, long now) {
        int active = (int) state.tickets().values().stream()
                .filter(ticket -> managed(ticket.owner()) == managed && ticket.status() == ADMITTED)
                .count();
        for (var entry : state.tickets().entrySet()) {
            if (active >= properties.admissionCapacity()) {
                break;
            }
            Ticket ticket = entry.getValue();
            if (managed(ticket.owner()) == managed && ticket.status() == WAITING) {
                entry.setValue(ticket.withStatus(ADMITTED, now + properties.admissionTtl().toMillis()));
                active++;
            }
        }
    }

    private static QueueView queueView(BookingState state, String token) {
        Ticket ticket = state.tickets().get(token);
        int position = 0;
        if (ticket.status() == WAITING) {
            for (var entry : state.tickets().entrySet()) {
                Ticket prior = entry.getValue();
                if (managed(prior.owner()) == managed(ticket.owner()) && prior.status() == WAITING) {
                    position++;
                }
                if (entry.getKey().equals(token)) {
                    break;
                }
            }
        }
        return new QueueView(token, ticket.status(), position, Instant.ofEpochMilli(ticket.expiresAt()));
    }

    private static void requireAdmission(Ticket ticket) {
        if (ticket.status() != ADMITTED) {
            throw new ReservationException(FORBIDDEN, "NOT_ADMITTED", "대기열 입장 허용 후 다시 시도해 주세요.");
        }
    }

    private static void requireFutureFlight(FlightOfferCatalog.Offer offer, long now) {
        if (offer.departureAt().toEpochMilli() <= now) {
            throw new ReservationException(GONE, "OFFER_EXPIRED", "출발 시간이 지나 예약할 수 없어요.");
        }
    }

    private Hold createHold(BookingState state, Ticket ticket, String flight,
                            List<String> requested, Quote quote, long now) {
        Hold current = currentHold(state, ticket);
        if (current != null) {
            if (current.flightKey().equals(flight) && current.seats().equals(requested)
                    && Objects.equals(current.quote(), quote)) {
                return current;
            }
            throw new ReservationException(CONFLICT, "HOLD_EXISTS", "기존 좌석 선점을 먼저 해제해 주세요.");
        }
        TreeSet<String> occupied = occupiedSeats(state, flight, managed(ticket.owner()), ticket.sessionId());
        if (requested.stream().anyMatch(occupied::contains)) {
            throw new ReservationException(CONFLICT, "SEAT_UNAVAILABLE", "선택한 좌석을 이용할 수 없어요.");
        }
        long expiresAt = Math.min(ticket.expiresAt(), now + properties.holdTtl().toMillis());
        if (quote != null) {
            expiresAt = Math.min(expiresAt, quote.departureAt());
        }
        Hold hold = new Hold(UUID.randomUUID().toString(), ticket.sessionId(), flight, requested, expiresAt, quote);
        state.holds().put(hold.holdId(), hold);
        return hold;
    }

    private static Hold currentHold(BookingState state, Ticket ticket) {
        return state.holds().values().stream()
                .filter(hold -> hold.sessionId().equals(ticket.sessionId()))
                .findFirst()
                .orElse(null);
    }

    private static TreeSet<String> occupiedSeats(BookingState state, String flight, boolean managed, String sessionId) {
        TreeSet<String> occupied = new TreeSet<>();
        for (Hold hold : state.holds().values()) {
            if (flight.equals(hold.flightKey()) && managed == (hold.quote() != null)
                    && !sessionId.equals(hold.sessionId())) {
                occupied.addAll(hold.seats());
            }
        }
        for (Receipt receipt : state.receipts().values()) {
            if (flight.equals(receipt.flightKey()) && managed == managed(receipt.owner())
                    && receipt.canceledAt() == null) {
                occupied.addAll(receipt.seats());
            }
        }
        return occupied;
    }

    private static Hold requireHold(BookingState state, String holdId, Ticket ticket) {
        Hold hold = state.holds().get(holdId);
        if (hold == null || !hold.sessionId().equals(ticket.sessionId())) {
            throw new ReservationException(NOT_FOUND, "HOLD_NOT_FOUND", "유효한 좌석 선점을 찾을 수 없어요.");
        }
        return hold;
    }

    private static String normalizeFlight(String flightKey) {
        if (flightKey == null || !FLIGHT_KEY.matcher(flightKey).matches()) {
            throw new ReservationException(BAD_REQUEST, "INVALID_FLIGHT", "항공편 식별자를 확인해 주세요.");
        }
        return flightKey.toUpperCase(Locale.ROOT);
    }

    private static List<String> normalizeSeats(List<String> seats) {
        if (seats == null || seats.isEmpty() || seats.size() > 9) {
            throw new ReservationException(BAD_REQUEST, "INVALID_SEATS", "좌석을 1~9개 선택해 주세요.");
        }
        TreeSet<String> unique = new TreeSet<>();
        for (String seat : seats) {
            String normalized = seat == null ? "" : seat.toUpperCase(Locale.ROOT);
            if (!SEAT.matcher(normalized).matches() || !unique.add(normalized)) {
                throw new ReservationException(BAD_REQUEST, "INVALID_SEATS", "좌석 번호가 잘못되었거나 중복돼요.");
            }
        }
        return List.copyOf(unique);
    }

    private static boolean managed(String owner) {
        return owner != null;
    }

    private static HoldView holdView(Hold hold) {
        return new HoldView(hold.holdId(), hold.flightKey(), hold.seats(), Instant.ofEpochMilli(hold.expiresAt()));
    }

    private static ReceiptView receiptView(Receipt receipt) {
        return new ReceiptView(receipt.reservationId(), receipt.flightKey(), receipt.seats(),
                Instant.ofEpochMilli(receipt.confirmedAt()));
    }

    private static HoldPriceView holdPriceView(Hold hold) {
        Quote quote = hold.quote();
        return new HoldPriceView(hold.holdId(), Instant.ofEpochMilli(hold.expiresAt()),
                quote.total(), quote.seatFee(), quote.fare(), quote.currency());
    }

    private static BookingView bookingView(Receipt receipt, long now) {
        Quote quote = receipt.quote();
        Long canceledAt = receipt.canceledAt();
        return new BookingView(receipt.reservationId(), canceledAt == null ? "confirmed" : "canceled",
                Instant.ofEpochMilli(receipt.confirmedAt()), canceledAt == null ? null : Instant.ofEpochMilli(canceledAt),
                quote.kind(), quote.flightId(), quote.airline(), quote.flightNums(), quote.route(), quote.date(),
                quote.depTime(), quote.arrTime(), quote.dayDiff(), quote.durationMin(), quote.cabin(),
                quote.passengers(), receipt.seats(), quote.fare(), quote.seatFee(), quote.total(), quote.currency(),
                canceledAt == null && quote.departureAt() > now);
    }

    public record QueueView(String token, Status state, int position, Instant expiresAt) {}
    public record HoldView(String holdId, String flightKey, List<String> seats, Instant expiresAt) {}
    public record ReceiptView(String reservationId, String flightKey, List<String> seats, Instant confirmedAt) {}
    public record AvailabilityView(List<String> occupiedSeats, Map<String, Integer> seatFees) {}
    public record HoldPriceView(String holdId, Instant expiresAt, BigDecimal total,
                                BigDecimal seatFee, BigDecimal fare, String currency) {}
    public record BookingView(String code, String status, Instant bookedAt, Instant canceledAt,
                              String kind, String flightId, String airline, String flightNums, String route,
                              String date, String depTime, String arrTime, int dayDiff, Integer durationMin,
                              String cabin, int passengers, List<String> seats, BigDecimal fare,
                              BigDecimal seatFee, BigDecimal total, String currency, boolean canCancel) {}

    private record Action<T>(T value, String sessionId, String outcome) {}
    private record Signal(String sessionId, String action, String outcome) {}
    private record Result<T>(T value, ReservationException failure, List<Signal> signals) {}

    @FunctionalInterface
    private interface Operation<T> {
        Action<T> run(BookingState state, String token, Ticket ticket, long now);
    }
}

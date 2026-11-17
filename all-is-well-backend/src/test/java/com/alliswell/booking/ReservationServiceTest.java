package com.alliswell.booking;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.alliswell.flights.FlightOfferCatalog.Offer;
import com.alliswell.traffic.ReservationEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReservationServiceTest {

    private static final String FLIGHT = "KE101:2026-12-01";
    private static final List<String> SEATS = List.of("13A");

    private final TestClock clock = new TestClock();

    @TempDir
    Path tempDir;

    @Test
    void waitingSessionBecomesAdmittedAfterConfirmationInQueueOrder() throws IOException {
        ReservationService booking = service(1, 30);
        var first = booking.join();
        var second = booking.join();
        var third = booking.join();
        assertEquals(BookingState.Status.ADMITTED, first.state());
        assertEquals(1, second.position());
        assertEquals(2, third.position());
        assertCode("NOT_ADMITTED", () -> booking.hold(second.token(), FLIGHT, SEATS));

        var hold = booking.hold(first.token(), FLIGHT, SEATS);
        var receipt = booking.confirm(first.token(), hold.holdId());
        assertEquals(BookingState.Status.COMPLETED, booking.status(first.token()).state());
        assertEquals(BookingState.Status.ADMITTED, booking.status(second.token()).state());
        assertEquals(1, booking.status(third.token()).position());
        assertEquals(receipt, booking.confirm(first.token(), hold.holdId()));
        assertCode("SEAT_UNAVAILABLE", () -> booking.hold(second.token(), FLIGHT, SEATS));
        assertEvent("BOOKING_CONFIRM", "ALREADY_CONFIRMED");
    }

    @Test
    void competingRequestsForSameSeatYieldExactlyOneWinner() throws Exception {
        ReservationService booking = service(2, 30);
        var first = booking.join();
        var second = booking.join();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<String> one = workers.submit(() -> compete(booking, first.token(), start));
            Future<String> two = workers.submit(() -> compete(booking, second.token(), start));
            start.countDown();
            assertEquals(List.of("HELD", "SEAT_UNAVAILABLE"),
                    List.of(one.get(3, TimeUnit.SECONDS), two.get(3, TimeUnit.SECONDS)).stream().sorted().toList());
        } finally {
            workers.shutdownNow();
        }
    }

    @Test
    void expiringHoldCanBeRetakenAndOldHoldCannotBeConfirmed() throws IOException {
        ReservationService booking = service(2, 30);
        var first = booking.join();
        var second = booking.join();
        var hold = booking.hold(first.token(), FLIGHT, SEATS);
        clock.advance(Duration.ofSeconds(5));
        var replacement = booking.hold(second.token(), FLIGHT, SEATS);
        assertNotEquals(hold.holdId(), replacement.holdId());
        assertCode("HOLD_NOT_FOUND", () -> booking.confirm(first.token(), hold.holdId()));
        assertEvent("HOLD_EXPIRED", "EXPIRED");
    }

    @Test
    void oneSessionCannotReleaseAnotherSessionsHold() {
        ReservationService booking = service(2, 30);
        var first = booking.join();
        var second = booking.join();
        var hold = booking.hold(first.token(), FLIGHT, SEATS);
        assertCode("QUEUE_TOKEN_INVALID", () -> booking.confirm(null, hold.holdId()));
        assertCode("HOLD_NOT_FOUND", () -> booking.release(second.token(), hold.holdId()));
        assertCode("SEAT_UNAVAILABLE", () -> booking.hold(second.token(), FLIGHT, SEATS));
        booking.release(first.token(), hold.holdId());
        assertEquals(SEATS, booking.hold(second.token(), FLIGHT, SEATS).seats());
    }

    @Test
    void repeatedHoldKeepsDeadlineAndRequestBudgetResets() {
        ReservationService booking = service(1, 2);
        var ticket = booking.join();
        var hold = booking.hold(ticket.token(), FLIGHT, SEATS);
        clock.advance(Duration.ofSeconds(1));
        assertEquals(hold, booking.hold(ticket.token(), FLIGHT, SEATS));
        assertCode("RATE_LIMITED", () -> booking.status(ticket.token()));
        clock.advance(Duration.ofSeconds(60));
        assertEquals(BookingState.Status.ADMITTED, booking.status(ticket.token()).state());
    }

    @Test
    void accountOwnsTicketAndCancellationReleasesSeatsInItsReservationGroup() {
        ReservationService booking = service(1, 30);
        var demo = booking.join();
        booking.hold(demo.token(), FLIGHT, SEATS);
        var owner = booking.join("account-one");
        var next = booking.join("account-two");
        Offer offer = offer(clock.instant().plusSeconds(600));

        assertEquals(BookingState.Status.ADMITTED, owner.state());
        assertEquals(owner.token(), booking.join("account-one").token());
        assertEquals(BookingState.Status.WAITING, next.state());
        assertCode("QUEUE_TOKEN_INVALID", () -> booking.status("account-two", owner.token()));
        assertCode("QUEUE_TOKEN_INVALID", () -> booking.status(owner.token()));
        assertCode("INVALID_SEATS", () -> booking.hold("account-one", owner.token(),
                offer.id(), List.of("12C"), () -> offer));

        var hold = booking.hold("account-one", owner.token(), offer.id(), SEATS, () -> offer);
        assertEquals(new BigDecimal("135000"), hold.total());
        assertEquals(new BigDecimal("15000"), hold.seatFee());
        assertEquals(hold, booking.hold("account-one", owner.token(), offer.id(), SEATS,
                () -> { throw new AssertionError("A repeated hold retains its snapshot"); }));
        assertCode("QUEUE_TOKEN_INVALID", () -> booking.confirm("account-two", owner.token(), hold.holdId()));

        var receipt = booking.confirm("account-one", owner.token(), hold.holdId());
        booking.withdraw("account-one", owner.token());
        assertEquals(receipt, booking.confirm("account-one", owner.token(), hold.holdId()));
        assertEquals(List.of(receipt), booking.bookings("account-one"));
        assertTrue(booking.bookings("account-two").isEmpty());
        assertCode("BOOKING_NOT_FOUND", () -> booking.cancel("account-two", receipt.code()));
        assertEquals(SEATS, booking.availability("account-two", next.token(), () -> offer).occupiedSeats());

        var canceled = booking.cancel("account-one", receipt.code());
        assertEquals("canceled", canceled.status());
        assertEquals(canceled, booking.cancel("account-one", receipt.code()));
        var availability = booking.availability("account-two", next.token(), () -> offer);
        assertEquals(Map.of("13A", 15000, "13B", 0), availability.seatFees());
        assertTrue(availability.occupiedSeats().isEmpty());
        assertEquals(hold.total(), booking.hold("account-two", next.token(), offer.id(), SEATS, () -> offer).total());
    }

    @Test
    void withdrawingClearsOpenHoldAndAdmitsNextOwner() {
        ReservationService booking = service(1, 30);
        var first = booking.join("account-one");
        var next = booking.join("account-two");
        Offer offer = offer(clock.instant().plusSeconds(600));
        booking.hold("account-one", first.token(), offer.id(), SEATS, () -> offer);
        booking.withdraw("account-two", first.token());
        assertEquals(BookingState.Status.WAITING, booking.status("account-two", next.token()).state());
        booking.withdraw("account-one", first.token());
        booking.withdraw("account-one", first.token());
        assertEquals(BookingState.Status.ADMITTED, booking.status("account-two", next.token()).state());
        assertTrue(booking.availability("account-two", next.token(), () -> offer).occupiedSeats().isEmpty());
    }

    @Test
    void managedHoldAndCancellationEndAtDeparture() {
        ReservationService booking = service(1, 30);
        var first = booking.join("account-one");
        Instant departure = clock.instant().plusSeconds(2);
        Offer offer = offer(departure);
        var hold = booking.hold("account-one", first.token(), offer.id(), SEATS, () -> offer);
        assertEquals(departure, hold.expiresAt());
        var receipt = booking.confirm("account-one", first.token(), hold.holdId());
        clock.advance(Duration.ofSeconds(2));
        assertCode("CANCELLATION_CLOSED", () -> booking.cancel("account-one", receipt.code()));
        assertEquals(false, booking.bookings("account-one").get(0).canCancel());
    }

    private static Offer offer(Instant departure) {
        return new Offer("offer", FLIGHT, "virtual", "demo-flight", "연습항공", "PR101", "GMP → CJU",
                "2026-11-16", "09:00", "10:00", 0, 60, "economy", 1, new BigDecimal("120000"),
                "KRW", departure, departure, Map.of("13A", 15000, "13B", 0));
    }

    private static String compete(ReservationService booking, String token, CountDownLatch start)
            throws InterruptedException {
        start.await();
        try {
            booking.hold(token, FLIGHT, SEATS);
            return "HELD";
        } catch (ReservationException failure) {
            return failure.code();
        }
    }

    private ReservationService service(int capacity, int requestLimit) {
        BookingProperties properties = new BookingProperties(capacity, 20, 100, requestLimit,
                Duration.ofMinutes(10), Duration.ofMinutes(5), Duration.ofSeconds(5), Duration.ofMinutes(10));
        ReservationEvents events = new ReservationEvents(new ObjectMapper(), eventFile().toString());
        return new ReservationService(new MemoryBookingStorage(), properties, events, clock);
    }

    private Path eventFile() {
        return tempDir.resolve("reservation-events.jsonl");
    }

    private void assertEvent(String action, String outcome) throws IOException {
        ObjectMapper json = new ObjectMapper();
        int matches = 0;
        for (String line : Files.readAllLines(eventFile())) {
            var event = json.readTree(line);
            if (action.equals(event.path("action").asText()) && outcome.equals(event.path("outcome").asText())) {
                Instant.parse(event.path("timestamp").asText());
                matches++;
            }
        }
        assertEquals(1, matches);
    }

    private static void assertCode(String code, Runnable action) {
        assertEquals(code, assertThrows(ReservationException.class, action::run).code());
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-11-16T00:00:00Z");

        void advance(Duration time) {
            now = now.plus(time);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(now, zone);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}

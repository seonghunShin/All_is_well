package com.alliswell.flights;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Currency;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FlightOfferCatalog {
    private static final long OFFER_TTL_SECONDS = 15 * 60;
    private static final int MAX_OFFERS = 10_000;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final Set<String> KOREAN_AIRPORTS = Set.of(
            "ICN", "GMP", "PUS", "CJU", "TAE", "CJJ", "KWJ", "RSU", "USN",
            "KPO", "HIN", "KUV", "WJU", "MWX", "YNY");
    private static final List<SyntheticAirline> AIRLINES = List.of(
            new SyntheticAirline("연습항공 (가상)", "PR", 0.70, 6),
            new SyntheticAirline("데모에어 (가상)", "DM", 0.78, 8),
            new SyntheticAirline("샘플스카이 (가상)", "SS", 0.90, 10),
            new SyntheticAirline("올웰항공 (가상)", "AW", 1.0, 12),
            new SyntheticAirline("테스트제트 (가상)", "TJ", 1.15, 14),
            new SyntheticAirline("베타에어 (가상)", "BT", 1.35, 17),
            new SyntheticAirline("프리미엄웨이 (가상)", "PW", 1.65, 19),
            new SyntheticAirline("로열데모 (가상)", "RD", 2.0, 21));
    private static final Map<String, Double> CABIN_MULTIPLIERS = Map.of(
            "economy", 1.0, "premium_economy", 1.6, "business", 2.8, "first", 4.5);

    private final Clock clock;
    private final Map<String, Offer> active = new LinkedHashMap<>();

    @Autowired
    public FlightOfferCatalog() {
        this(Clock.system(FlightLookup.SEOUL));
    }

    FlightOfferCatalog(Clock clock) {
        this.clock = clock.withZone(FlightLookup.SEOUL);
    }

    public synchronized Offer require(String offerId) {
        Offer offer = active.get(offerId);
        if (offer == null || !offer.expiresAt().isAfter(clock.instant())
                || !offer.departureAt().isAfter(clock.instant())) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "예약용 조회 정보가 만료됐어요. 항공권을 다시 검색해 주세요.");
        }
        return offer;
    }

    void attachRealOffers(JsonNode itineraries, String cabin, int passengers) {
        for (JsonNode itinerary : itineraries) {
            if (itinerary instanceof ObjectNode entry) {
                Offer offer = realOffer(entry, cabin, passengers);
                if (offer != null) {
                    entry.put("booking_offer_id", register(offer));
                }
            }
        }
    }

    List<VirtualFlight> virtualFlights(String origin, String destination,
                                       LocalDate date, String cabin, int passengers) {
        DemoRandom random = new DemoRandom(origin + "-" + destination + "-" + date);
        int baseDuration = 60 + random.below(240);
        long baseFare = 50_000L + baseDuration * 600L + random.below(10) * 5_000L;
        List<VirtualFlight> results = new ArrayList<>();
        for (int index = 0; index < AIRLINES.size(); index++) {
            SyntheticAirline carrier = AIRLINES.get(index);
            LocalDateTime departure = date.atTime(carrier.hour(), random.below(4) * 15);
            int duration = baseDuration + random.below(5) * 5;
            LocalDateTime arrival = departure.plusMinutes(duration);
            double variation = 0.85 + random.next() * 0.30;
            double estimate = baseFare * carrier.multiplier() * timeFactor(carrier.hour())
                    * dateFactor(date) * CABIN_MULTIPLIERS.get(cabin) * variation;
            long price = Math.max(30_000L, Math.round(estimate / 1000) * 1000);
            String flightNumber = carrier.code() + (100 + random.below(800));
            Instant departureAt = departure.atZone(FlightLookup.SEOUL).toInstant();
            if (!departureAt.isAfter(clock.instant())) {
                continue;
            }
            String flightId = "virtual-" + origin + "-" + destination + "-" + date + "-" + cabin + "-" + index;
            String route = origin + " → " + destination;
            BigDecimal fare = BigDecimal.valueOf(price * passengers);
            Offer offer = new Offer(offerId(), flightId, "virtual", flightId, carrier.name(), flightNumber,
                    route, date.toString(), departure.format(TIME), arrival.format(TIME),
                    daysBetween(departure, arrival), duration, cabin, passengers, fare, "KRW",
                    departureAt, offerExpiry(departureAt), layout(cabin, "KRW"));
            results.add(new VirtualFlight(flightId, register(offer), true, route, offer.date(),
                    carrier.name(), flightNumber, departure.toString(), offer.depTime(), offer.arrTime(),
                    offer.dayDiff(), duration, 0, List.of(), price, fare, "KRW", false));
        }
        return results;
    }

    private Offer realOffer(JsonNode itinerary, String cabin, int passengers) {
        JsonNode leg = itinerary.path("outbound");
        JsonNode segments = leg.path("segments");
        JsonNode price = itinerary.path("price");
        String originalId = itinerary.path("ignav_id").asText("");
        String currency = price.path("currency").asText("");
        if (originalId.isBlank() || !segments.isArray() || segments.isEmpty()
                || !price.path("amount").isNumber() || !validCurrency(currency)) {
            return null;
        }

        try {
            BigDecimal fare = price.path("amount").decimalValue();
            if (fare.signum() <= 0 || fare.compareTo(BigDecimal.valueOf(1_000_000_000L)) > 0) {
                return null;
            }
            JsonNode first = segments.get(0);
            JsonNode last = segments.get(segments.size() - 1);
            LocalDateTime departure = LocalDateTime.parse(first.path("departure_time_local").asText());
            LocalDateTime arrival = LocalDateTime.parse(last.path("arrival_time_local").asText());
            Instant departureAt = departureInstant(first, departure);
            if (departureAt == null || !departureAt.isAfter(clock.instant())) {
                return null;
            }
            List<String> flightNumbers = new ArrayList<>();
            List<String> inventory = new ArrayList<>();
            for (JsonNode segment : segments) {
                String number = segment.path("marketing_carrier_code").asText("")
                        + segment.path("flight_number").asText("");
                if (!number.isBlank()) {
                    flightNumbers.add(number);
                }
                inventory.add(String.join("|", segment.path("departure_airport").asText(""),
                        segment.path("arrival_airport").asText(""),
                        segment.path("departure_time_local").asText(""),
                        segment.path("arrival_time_local").asText(""), number));
            }
            String airline = leg.path("carrier").asText(
                    first.path("operating_carrier_name").asText("항공사 정보 없음"));
            Integer duration = leg.path("duration_minutes").canConvertToInt()
                    ? leg.path("duration_minutes").asInt() : null;
            String flightKey = "real-" + hash(cabin + "|" + String.join(";", inventory));
            String route = first.path("departure_airport").asText()
                    + " → " + last.path("arrival_airport").asText();
            return new Offer(offerId(), flightKey, "real", originalId, airline, String.join(", ", flightNumbers),
                    route, departure.toLocalDate().toString(), departure.format(TIME), arrival.format(TIME),
                    daysBetween(departure, arrival), duration, cabin, passengers, fare, currency,
                    departureAt, offerExpiry(departureAt), layout(cabin, currency));
        } catch (java.time.DateTimeException error) {
            return null;
        }
    }

    private static Instant departureInstant(JsonNode first, LocalDateTime departure) {
        String utc = first.path("departure_time_utc").asText("");
        if (!utc.isBlank()) {
            return OffsetDateTime.parse(utc).toInstant();
        }
        String zone = first.path("departure_timezone").asText("");
        if (!zone.isBlank()) {
            return departure.atZone(ZoneId.of(zone)).toInstant();
        }
        return KOREAN_AIRPORTS.contains(first.path("departure_airport").asText())
                ? departure.atZone(FlightLookup.SEOUL).toInstant() : null;
    }

    private static Map<String, Integer> layout(String cabin, String currency) {
        int rows = switch (cabin) {
            case "premium_economy" -> 12;
            case "business" -> 8;
            case "first" -> 4;
            default -> 25;
        };
        String columns = switch (cabin) {
            case "business" -> "ACDF";
            case "first" -> "AF";
            default -> "ABCDEF";
        };
        var seats = new LinkedHashMap<String, Integer>();
        for (int row = 1; row <= rows; row++) {
            int fee = 0;
            if ("economy".equals(cabin) && "KRW".equals(currency)) {
                fee = row <= 3 ? 15_000 : row == 11 || row == 12 ? 10_000 : 0;
            }
            for (int column = 0; column < columns.length(); column++) {
                seats.put(row + String.valueOf(columns.charAt(column)), fee);
            }
        }
        return Map.copyOf(seats);
    }

    private synchronized String register(Offer offer) {
        if (active.size() >= MAX_OFFERS) {
            Instant now = clock.instant();
            active.values().removeIf(value -> !value.expiresAt().isAfter(now));
        }
        if (active.size() >= MAX_OFFERS) {
            active.remove(active.keySet().iterator().next());
        }
        active.put(offer.id(), offer);
        return offer.id();
    }

    private Instant offerExpiry(Instant departure) {
        Instant expiry = clock.instant().plusSeconds(OFFER_TTL_SECONDS);
        return departure.isBefore(expiry) ? departure : expiry;
    }

    private static String hash(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is required", error);
        }
    }

    private static String offerId() {
        return UUID.randomUUID().toString();
    }

    private static boolean validCurrency(String code) {
        try {
            Currency.getInstance(code);
            return true;
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private static int daysBetween(LocalDateTime departure, LocalDateTime arrival) {
        return (int) ChronoUnit.DAYS.between(departure.toLocalDate(), arrival.toLocalDate());
    }

    private double dateFactor(LocalDate date) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(clock), date);
        double factor = days < 3 ? 1.45 : days < 7 ? 1.30 : days < 14 ? 1.15 : days > 60 ? 0.92 : 1;
        return Set.of(DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY).contains(date.getDayOfWeek())
                ? factor * 1.1 : factor;
    }

    private static double timeFactor(int hour) {
        return hour < 7 || hour >= 21 ? 0.88 : hour >= 17 && hour < 20 ? 1.12 : hour < 10 ? 1.08 : 1;
    }

    // Matches the seeded pseudo-random sequence of the original virtual flights.
    private static class DemoRandom {
        private int state = 0x811c9dc5;

        DemoRandom(String seed) {
            for (int i = 0; i < seed.length(); i++) {
                state = (state ^ seed.charAt(i)) * 0x01000193;
            }
        }

        double next() {
            state += 0x6d2b79f5;
            int value = (state ^ state >>> 15) * (state | 1);
            value ^= value + (value ^ value >>> 7) * (value | 61);
            return Integer.toUnsignedLong(value ^ value >>> 14) / 4294967296.0;
        }

        int below(int limit) {
            return (int) (next() * limit);
        }
    }

    public record Offer(String id, String flightKey, String kind, String flightId, String airline,
                        String flightNums, String route, String date, String depTime, String arrTime, int dayDiff,
                        Integer durationMin, String cabin, int passengers, BigDecimal fare, String currency,
                        Instant departureAt, Instant expiresAt, Map<String, Integer> seats) {}

    record VirtualFlight(String id, String offerId, boolean virtual, String route, String date, String airline,
                         String flightNums, String depLocal, String depTime, String arrTime, int dayDiff,
                         int durationMin, int stops, List<String> via, long price, BigDecimal fare,
                         String currency, boolean selfTransfer) {}

    private record SyntheticAirline(String name, String code, double multiplier, int hour) {}
}

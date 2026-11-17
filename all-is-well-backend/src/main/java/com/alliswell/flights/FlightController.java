package com.alliswell.flights;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class FlightController {
    private static final Pattern IATA = Pattern.compile("[A-Z]{3}");
    private static final Pattern DATE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}");
    private static final Pattern SCHEME_PREFIX = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:");
    private static final Set<String> CABINS = Set.of("economy", "premium_economy", "business", "first");
    private static final int REQUESTS_PER_MINUTE = 20;

    private final FlightLookup lookup;
    private final ObjectMapper mapper;
    private final FlightOfferCatalog catalog;
    private final String market;
    private final Map<String, ArrayDeque<Instant>> clientHits = new HashMap<>();

    FlightController(
            FlightLookup lookup,
            ObjectMapper mapper,
            FlightOfferCatalog catalog,
            @Value("${app.ignav.market:KR}") String market
    ) {
        this.lookup = lookup;
        this.mapper = mapper;
        this.catalog = catalog;
        this.market = market;
    }

    @GetMapping("/health")
    Map<String, Object> health() {
        return lookup.health();
    }

    @PostMapping("/flights/search")
    ObjectNode search(@RequestBody(required = false) JsonNode request, HttpServletRequest httpRequest) {
        checkRate(httpRequest.getRemoteAddr());
        Search search = canonicalSearch(request);
        try {
            FlightLookup.LookupResult result = lookup.load("/fares/one-way", Map.of(
                    "origin", search.origin(),
                    "destination", search.destination(),
                    "departure_date", search.date().toString(),
                    "adults", search.adults(),
                    "cabin_class", search.cabin(),
                    "market", market
            ));
            JsonNode payload = result.body();
            if (!payload.path("itineraries").isArray()) {
                throw new FlightRequestException(502, "항공권 정보를 가져오지 못했어요.");
            }
            ObjectNode response = payload.deepCopy();
            catalog.attachRealOffers(response.path("itineraries"), search.cabin(), search.adults());
            response.put("cached", result.cached());
            return response;
        } catch (FlightRequestException error) {
            if (error.status() == 404) {
                ObjectNode empty = mapper.createObjectNode();
                empty.putArray("itineraries");
                empty.put("cached", false);
                return empty;
            }
            throw error;
        }
    }

    @PostMapping("/flights/virtual")
    Map<String, Object> virtualFlights(@RequestBody(required = false) JsonNode request, HttpServletRequest httpRequest) {
        checkRate(httpRequest.getRemoteAddr());
        Search search = canonicalSearch(request);
        return Map.of("flights", catalog.virtualFlights(search.origin(), search.destination(),
                search.date(), search.cabin(), search.adults()));
    }

    private Search canonicalSearch(JsonNode request) {
        JsonNode body = object(request);
        String origin = text(body, "origin", "").toUpperCase(Locale.ROOT);
        String destination = text(body, "destination", "").toUpperCase(Locale.ROOT);
        if (!IATA.matcher(origin).matches() || !IATA.matcher(destination).matches()) {
            throw invalid("공항 코드가 올바르지 않아요.");
        }
        if (origin.equals(destination)) {
            throw invalid("출발지와 도착지가 같을 수 없어요.");
        }
        LocalDate date = departureDate(text(body, "departure_date", ""));
        if (date.isBefore(lookup.today())) {
            throw invalid("지난 날짜는 조회할 수 없어요.");
        }
        int adults = passengers(body);
        String cabin = text(body, "cabin_class", "economy");
        if (!CABINS.contains(cabin)) {
            throw invalid("좌석 등급이 올바르지 않아요.");
        }
        return new Search(origin, destination, date, adults, cabin);
    }

    @PostMapping("/flights/booking-links")
    Map<String, Object> bookingLinks(@RequestBody(required = false) JsonNode request, HttpServletRequest httpRequest) {
        checkRate(httpRequest.getRemoteAddr());
        String id = text(object(request), "ignav_id", "");
        if (!id.matches("[a-fA-F0-9]{32}")) {
            throw invalid("잘못된 항공편 ID예요.");
        }
        JsonNode result = lookup.load("/fares/booking-links", Map.of("ignav_id", id)).body();
        ArrayList<ObjectNode> options = new ArrayList<>();
        for (JsonNode option : result.path("booking_options")) {
            for (JsonNode link : option.path("links")) {
                String url = safeUrl(text(link, "url", ""));
                if (url != null) {
                    ObjectNode entry = mapper.createObjectNode();
                    entry.set("legs", option.path("legs").isArray() ? option.path("legs") : mapper.createArrayNode());
                    entry.put("provider_name", text(link, "provider_name", "판매처"));
                    copyOptional(entry, link, "provider_type");
                    copyOptional(entry, link, "fare_name");
                    copyOptional(entry, link, "specificity");
                    copyOptional(entry, link, "price");
                    entry.put("url", url);
                    options.add(entry);
                }
            }
        }
        return Map.of("options", options);
    }

    private synchronized void checkRate(String address) {
        Instant now = Instant.now();
        Instant cutoff = now.minusSeconds(60);
        clientHits.values().removeIf(hits -> !hits.getLast().isAfter(cutoff));
        ArrayDeque<Instant> hits = clientHits.computeIfAbsent(address, key -> new ArrayDeque<>());
        while (!hits.isEmpty() && !hits.getFirst().isAfter(cutoff)) {
            hits.removeFirst();
        }
        if (hits.size() >= REQUESTS_PER_MINUTE) {
            throw new FlightRequestException(429, "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.");
        }
        hits.addLast(now);
    }

    @ExceptionHandler(FlightRequestException.class)
    ResponseEntity<Map<String, String>> handleFlightError(FlightRequestException error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> handleMalformedJson() {
        return handleFlightError(invalid("요청 형식을 확인해주세요."));
    }

    private static FlightRequestException invalid(String message) {
        return new FlightRequestException(400, message);
    }

    private static JsonNode object(JsonNode value) {
        if (value == null || value.isNull()) {
            return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        }
        if (!value.isObject()) {
            throw invalid("요청 형식을 확인해주세요.");
        }
        return value;
    }

    private static String text(JsonNode node, String field, String defaultValue) {
        JsonNode value = node.path(field);
        if (value.isNull() || value.isMissingNode()) {
            return defaultValue;
        }
        return value.asText("");
    }

    private static LocalDate departureDate(String date) {
        if (DATE.matcher(date).matches()) {
            try {
                return LocalDate.parse(date);
            } catch (DateTimeParseException ignored) {
                // An impossible calendar date gets the same response as an invalid format.
            }
        }
        throw invalid("출발일 형식이 올바르지 않아요.");
    }

    private static int passengers(JsonNode body) {
        String raw = text(body, "adults", "1");
        if (!raw.matches("[1-9]")) {
            throw invalid("인원은 1~9명까지 가능해요.");
        }
        return Integer.parseInt(raw);
    }

    private static void copyOptional(ObjectNode target, JsonNode source, String field) {
        target.set(field, source.get(field));
    }

    private static String safeUrl(String raw) {
        if (raw.isBlank()) {
            return null;
        }
        try {
            String absolute = SCHEME_PREFIX.matcher(raw).find() ? raw : "https://" + raw;
            URI uri = URI.create(absolute);
            String scheme = uri.getScheme();
            if (uri.getHost() != null && uri.getUserInfo() == null
                    && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                return uri.toASCIIString();
            }
        } catch (IllegalArgumentException ignored) {
            // Ignore malformed links from the provider.
        }
        return null;
    }

    private record Search(String origin, String destination, LocalDate date, int adults, String cabin) {}
}

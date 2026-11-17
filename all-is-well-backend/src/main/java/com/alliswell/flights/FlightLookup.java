package com.alliswell.flights;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
class FlightLookup {
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final int CACHE_CAPACITY = 500;

    private final IgnavClient client;
    private final int dailyLimit;
    private final Duration cacheTtl;
    private final Clock clock;
    private final Map<Query, Cached> cache = new LinkedHashMap<>(16, 0.75f, true);
    private final Map<Query, CompletableFuture<JsonNode>> inFlight = new HashMap<>();
    private LocalDate usageDay;
    private int callsToday;

    @Autowired
    FlightLookup(
            IgnavClient client,
            @Value("${app.ignav.daily-limit:100}") int dailyLimit,
            @Value("${app.ignav.cache-ttl-minutes:10}") int cacheTtlMinutes
    ) {
        this(client, dailyLimit, cacheTtlMinutes, Clock.system(SEOUL));
    }

    FlightLookup(IgnavClient client, int dailyLimit, int cacheTtlMinutes, Clock clock) {
        if (dailyLimit < 0 || cacheTtlMinutes < 0) {
            throw new IllegalArgumentException("Ignav daily limit and cache TTL must be nonnegative");
        }
        this.client = client;
        this.dailyLimit = dailyLimit;
        this.cacheTtl = Duration.ofMinutes(cacheTtlMinutes);
        this.clock = clock.withZone(SEOUL);
    }

    LocalDate today() {
        return LocalDate.now(clock);
    }

    synchronized Map<String, Object> health() {
        advanceUsageDay();
        return Map.of("ok", true, "upstreamCallsToday", callsToday, "dailyLimit", dailyLimit);
    }

    LookupResult load(String path, Map<String, Object> input) {
        Query query = new Query(path, Map.copyOf(input));
        CompletableFuture<JsonNode> future;
        LocalDate chargedDay = null;
        synchronized (this) {
            Cached hit = cache.get(query);
            if (hit != null) {
                if (hit.expires().isAfter(clock.instant())) {
                    return new LookupResult(hit.body(), true);
                }
                cache.remove(query);
            }
            future = inFlight.get(query);
            if (future == null) {
                advanceUsageDay();
                if (callsToday >= dailyLimit) {
                    throw new FlightRequestException(429, "오늘 조회 가능 횟수를 모두 사용했어요. 내일 다시 시도해주세요.");
                }
                callsToday++;
                chargedDay = usageDay;
                future = new CompletableFuture<>();
                inFlight.put(query, future);
            }
        }
        if (chargedDay == null) {
            return new LookupResult(await(future), true);
        }

        try {
            JsonNode body = client.post(path, query.body());
            synchronized (this) {
                cache.put(query, new Cached(body, clock.instant().plus(cacheTtl)));
                if (cache.size() > CACHE_CAPACITY) {
                    cache.remove(cache.keySet().iterator().next());
                }
            }
            future.complete(body);
            return new LookupResult(body, false);
        } catch (RuntimeException error) {
            synchronized (this) {
                if (chargedDay.equals(usageDay)) {
                    callsToday--;
                }
            }
            future.completeExceptionally(error);
            throw error;
        } finally {
            synchronized (this) {
                inFlight.remove(query);
            }
        }
    }

    private static JsonNode await(CompletableFuture<JsonNode> future) {
        try {
            return future.join();
        } catch (CompletionException error) {
            if (error.getCause() instanceof RuntimeException cause) {
                throw cause;
            }
            throw error;
        }
    }

    private void advanceUsageDay() {
        LocalDate day = today();
        if (!day.equals(usageDay)) {
            usageDay = day;
            callsToday = 0;
        }
    }

    record LookupResult(JsonNode body, boolean cached) {}
    private record Query(String path, Map<String, Object> body) {}
    private record Cached(JsonNode body, Instant expires) {}
}

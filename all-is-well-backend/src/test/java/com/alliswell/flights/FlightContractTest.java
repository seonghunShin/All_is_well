package com.alliswell.flights;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FlightContractTest {
    private static final String DATE = "2026-11-23";
    private static final String ID = "5e4fcd2f1dc340649eb19f6ee2afb57a";
    private static final String SEARCH = """
            {"origin":"gmp","destination":"cju","departure_date":"2026-11-23","adults":2,"cabin_class":"economy"}
            """;
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-16T00:00:00Z"), FlightLookup.SEOUL);

    private final ObjectMapper mapper = new ObjectMapper();
    private TestIgnavClient client;
    private MockMvc mvc;

    @BeforeEach
    void configureController() {
        client = new TestIgnavClient();
        mvc = MockMvcBuilders.standaloneSetup(new FlightController(
                        new FlightLookup(client, 10, 10, CLOCK), mapper, new FlightOfferCatalog(CLOCK), "KR"))
                .build();
    }

    @Test
    void preservesTheReactSearchShapeAndMarksCacheHits() throws Exception {
        Map<String, Object> upstreamInput = Map.of(
                "origin", "GMP", "destination", "CJU", "departure_date", DATE,
                "adults", 2, "cabin_class", "economy", "market", "KR"
        );
        JsonNode response = mapper.readTree("""
                {
                  "observed_at":"2026-11-16T01:00:00Z",
                  "itineraries":[{
                    "ignav_id":"%s","price":{"amount":33500,"currency":"KRW"},
                    "outbound":{"carrier":"제주항공","segments":[{
                      "departure_airport":"GMP","arrival_airport":"CJU",
                      "departure_time_local":"2026-11-23T08:30:00",
                      "arrival_time_local":"2026-11-23T09:40:00"
                    }]}
                  }]
                }
                """.formatted(ID));
        client.response = (path, input) -> {
            assertThat(path).isEqualTo("/fares/one-way");
            assertThat(input).isEqualTo(upstreamInput);
            return response;
        };
        mvc.perform(post("/api/flights/search").contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cached").value(false))
                .andExpect(jsonPath("$.observed_at").value("2026-11-16T01:00:00Z"))
                .andExpect(jsonPath("$.itineraries[0].ignav_id").value(ID))
                .andExpect(jsonPath("$.itineraries[0].price.amount").value(33500))
                .andExpect(jsonPath("$.itineraries[0].booking_offer_id").isString())
                .andExpect(jsonPath("$.itineraries[0].outbound.segments[0].departure_airport").value("GMP"));
        mvc.perform(post("/api/flights/search").contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cached").value(true));
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.upstreamCallsToday").value(1))
                .andExpect(jsonPath("$.dailyLimit").value(10));
        assertThat(client.calls.get()).isEqualTo(1);
    }

    @Test
    void flattensBookingOptionsAndExcludesUnsupportedUrls() throws Exception {
        JsonNode response = mapper.readTree("""
                {"booking_options":[{"legs":["outbound"],"links":[
                  {"provider_name":"제주항공","provider_type":"airline","fare_name":"일반석",
                   "specificity":"exact_flight","price":{"amount":33500,"currency":"KRW"},
                   "url":"www.example.com/booking"},
                  {"url":"javascript:alert(1)"}
                ]}]}
                """);
        client.response = (path, input) -> {
            assertThat(path).isEqualTo("/fares/booking-links");
            assertThat(input).isEqualTo(Map.of("ignav_id", ID));
            return response;
        };
        mvc.perform(post("/api/flights/booking-links").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ignav_id\":\"" + ID + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options.length()").value(1))
                .andExpect(jsonPath("$.options[0].legs[0]").value("outbound"))
                .andExpect(jsonPath("$.options[0].provider_name").value("제주항공"))
                .andExpect(jsonPath("$.options[0].provider_type").value("airline"))
                .andExpect(jsonPath("$.options[0].fare_name").value("일반석"))
                .andExpect(jsonPath("$.options[0].specificity").value("exact_flight"))
                .andExpect(jsonPath("$.options[0].price.currency").value("KRW"))
                .andExpect(jsonPath("$.options[0].url").value("https://www.example.com/booking"));
    }

    @Test
    void rejectsInvalidInputWithoutCallingIgnav() throws Exception {
        mvc.perform(post("/api/flights/search").contentType(MediaType.APPLICATION_JSON)
                        .content(SEARCH.replace(DATE, "2026-11-31")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("출발일 형식이 올바르지 않아요."));
        mvc.perform(post("/api/flights/booking-links").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ignav_id\":\"invalid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("잘못된 항공편 ID예요."));
        assertThat(client.calls.get()).isZero();
    }

    @Test
    void emptySearchAndProviderErrorsMatchTheReactContract() throws Exception {
        client.response = (path, input) -> {
            assertThat(path).isEqualTo("/fares/one-way");
            if (client.calls.get() == 1) {
                throw new FlightRequestException(404, "조건에 맞는 결과를 찾지 못했어요.");
            }
            throw new FlightRequestException(502, "서버의 항공권 API 키 설정을 확인해주세요.");
        };
        mvc.perform(post("/api/flights/search").contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itineraries.length()").value(0))
                .andExpect(jsonPath("$.cached").value(false));
        mvc.perform(post("/api/flights/search").contentType(MediaType.APPLICATION_JSON).content(SEARCH))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error").value("서버의 항공권 API 키 설정을 확인해주세요."));
        mvc.perform(get("/api/health")).andExpect(jsonPath("$.upstreamCallsToday").value(0));
    }

    @Test
    void coalescesIdenticalSearchesWhileReservingTheLastDailyCall() throws Exception {
        FlightLookup lookup = new FlightLookup(client, 1, 10, CLOCK);
        Map<String, Object> request = Map.of("origin", "GMP", "destination", "CJU");
        JsonNode payload = mapper.readTree("{\"itineraries\":[]}");
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        client.response = (path, input) -> {
            assertThat(path).isEqualTo("/fares/one-way");
            assertThat(input).isEqualTo(request);
            started.countDown();
            try {
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new AssertionError(error);
            }
            return payload;
        };
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> lookup.load("/fares/one-way", request));
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> lookup.load("/fares/one-way", request));
            assertThatThrownBy(() -> lookup.load("/fares/one-way", Map.of("origin", "ICN")))
                    .isInstanceOfSatisfying(FlightRequestException.class, error -> assertThat(error.status()).isEqualTo(429));
            release.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS).cached()).isFalse();
            assertThat(second.get(5, TimeUnit.SECONDS).cached()).isTrue();
            assertThat(client.calls.get()).isEqualTo(1);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    private static final class TestIgnavClient extends IgnavClient {
        private final AtomicInteger calls = new AtomicInteger();
        private BiFunction<String, Map<String, Object>, JsonNode> response = (path, input) -> {
            throw new AssertionError("Unexpected Ignav request: " + path);
        };

        private TestIgnavClient() {
            super("");
        }

        @Override
        JsonNode post(String path, Map<String, Object> body) {
            calls.incrementAndGet();
            return response.apply(path, body);
        }
    }
}

package com.alliswell.flights;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
class IgnavClient {
    private final RestClient client;
    private final String apiKey;

    IgnavClient(@Value("${app.ignav.api-key:}") String apiKey) {
        this.apiKey = apiKey.trim();
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(25));
        this.client = RestClient.builder()
                .baseUrl("https://ignav.com/api")
                .requestFactory(factory)
                .build();
    }

    JsonNode post(String path, Map<String, Object> body) {
        if (apiKey.isBlank()) {
            throw new FlightRequestException(503, "서버의 항공권 API 키 설정을 확인해주세요.");
        }
        try {
            JsonNode response = client.post()
                    .uri(path)
                    .header("X-Api-Key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(status -> !status.is2xxSuccessful(), (request, result) -> {
                        throw upstreamError(result.getStatusCode().value());
                    })
                    .body(JsonNode.class);
            if (response == null || !response.isObject()) {
                throw upstreamError(502);
            }
            return response;
        } catch (ResourceAccessException error) {
            throw new FlightRequestException(504, "항공권 서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.");
        } catch (RestClientException error) {
            throw upstreamError(502);
        }
    }

    private static FlightRequestException upstreamError(int status) {
        return switch (status) {
            case 400, 422 -> new FlightRequestException(400, "검색 조건을 확인해주세요.");
            case 401, 403 -> new FlightRequestException(502, "서버의 항공권 API 키 설정을 확인해주세요.");
            case 404 -> new FlightRequestException(404, "조건에 맞는 결과를 찾지 못했어요.");
            case 429 -> new FlightRequestException(429, "요청이 많아요. 잠시 후 다시 시도해주세요.");
            default -> new FlightRequestException(502, "항공권 정보를 가져오지 못했어요.");
        };
    }
}

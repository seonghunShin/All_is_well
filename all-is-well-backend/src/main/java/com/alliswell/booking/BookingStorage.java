package com.alliswell.booking;

import java.util.List;
import java.util.function.Function;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;

interface BookingStorage {

    <T> T update(Function<BookingState, T> operation);
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(BookingProperties.class)
class BookingStorageConfiguration {

    @Bean
    @ConditionalOnProperty(name = "booking.store", havingValue = "memory", matchIfMissing = true)
    BookingStorage memoryBookingStorage() {
        return new MemoryBookingStorage();
    }

    @Bean
    @ConditionalOnProperty(name = "booking.store", havingValue = "redis")
    BookingStorage redisBookingStorage(
            StringRedisTemplate redis,
            ObjectMapper mapper,
            @Value("${booking.redis-key:all-is-well:booking:v1}") String redisKey) {
        return new RedisBookingStorage(redis, mapper, redisKey);
    }
}

final class MemoryBookingStorage implements BookingStorage {

    private final BookingState state = new BookingState();

    @Override
    public synchronized <T> T update(Function<BookingState, T> operation) {
        return operation.apply(state);
    }
}

final class RedisBookingStorage implements BookingStorage {

    private static final int MAX_ATTEMPTS = 16;
    private static final DefaultRedisScript<Long> WRITE_IF_UNCHANGED = new DefaultRedisScript<>("""
            local existing = redis.call('GET', KEYS[1]) or ''
            if existing ~= ARGV[1] then
                return 0
            end
            redis.call('SET', KEYS[1], ARGV[2])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final String key;

    RedisBookingStorage(StringRedisTemplate redis, ObjectMapper mapper, String key) {
        this.redis = redis;
        this.mapper = mapper;
        this.key = key;
    }

    @Override
    public <T> T update(Function<BookingState, T> operation) {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String before = redis.opsForValue().get(key);
            BookingState state = decode(before);
            T result = operation.apply(state);
            Long committed = redis.execute(
                    WRITE_IF_UNCHANGED, List.of(key), before == null ? "" : before, encode(state));
            if (Long.valueOf(1L).equals(committed)) {
                return result;
            }
        }
        throw new ReservationException(
                HttpStatus.SERVICE_UNAVAILABLE, "BOOKING_BUSY", "예약 요청이 집중되었어요. 잠시 후 다시 시도해 주세요.");
    }

    private BookingState decode(String json) {
        if (json == null) {
            return new BookingState();
        }
        try {
            return mapper.readValue(json, BookingState.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("예약 상태를 읽지 못했습니다.", exception);
        }
    }

    private String encode(BookingState state) {
        try {
            return mapper.writeValueAsString(state);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("예약 상태를 저장하지 못했습니다.", exception);
        }
    }
}

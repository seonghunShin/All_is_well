package com.alliswell.booking;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@ConditionalOnProperty(name = "booking.store", havingValue = "database")
class JdbcBookingStorage implements BookingStorage {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    JdbcBookingStorage(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS booking_state (
                    id INT PRIMARY KEY,
                    revision BIGINT NOT NULL,
                    state_json CLOB NOT NULL
                )
                """);
        try {
            jdbc.update("INSERT INTO booking_state VALUES (1, 0, ?)", encode(new BookingState()));
        } catch (DuplicateKeyException ignored) {
            // The existing row is the durable booking state.
        }
    }

    @Override
    public <T> T update(Function<BookingState, T> operation) {
        for (int attempt = 0; attempt < 16; attempt++) {
            Snapshot current = jdbc.queryForObject(
                    "SELECT revision, state_json FROM booking_state WHERE id = 1",
                    (row, index) -> new Snapshot(row.getLong("revision"), row.getString("state_json")));
            if (current == null) {
                throw new IllegalStateException("예약 상태 행이 없습니다.");
            }
            BookingState state = decode(current.json());
            T result = operation.apply(state);
            if (jdbc.update("""
                    UPDATE booking_state SET revision = revision + 1, state_json = ?
                    WHERE id = 1 AND revision = ?
                    """, encode(state), current.revision()) == 1) {
                return result;
            }
        }
        throw new ReservationException(HttpStatus.SERVICE_UNAVAILABLE,
                "BOOKING_BUSY", "예약 요청이 집중되었어요. 잠시 후 다시 시도해 주세요.");
    }

    private String encode(BookingState state) {
        try {
            return json.writeValueAsString(state);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("예약 상태를 저장할 수 없습니다.", error);
        }
    }

    private BookingState decode(String state) {
        try {
            return json.readValue(state, BookingState.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("예약 상태를 읽을 수 없습니다.", error);
        }
    }

    private record Snapshot(long revision, String json) {}
}

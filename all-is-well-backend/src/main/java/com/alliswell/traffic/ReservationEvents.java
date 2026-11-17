package com.alliswell.traffic;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ReservationEvents {
    private static final Logger log = LoggerFactory.getLogger(ReservationEvents.class);

    private final ObjectMapper json;
    private final Path file;

    public ReservationEvents(ObjectMapper json, @Value("${booking.log-file}") String file) {
        this.json = json;
        this.file = Path.of(file).toAbsolutePath();
    }

    public synchronized void record(String sessionId, String action, String outcome) {
        try {
            Files.createDirectories(file.getParent());
            String line = json.writeValueAsString(new Event(
                    sessionId, action, outcome, Instant.now().toString()));
            Files.writeString(file, line + "\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException error) {
            log.warn("Could not write a reservation event for action {}: {}",
                    action, error.getClass().getSimpleName());
        }
    }

    private record Event(String sessionId, String action, String outcome, String timestamp) {
    }
}

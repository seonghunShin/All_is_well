package com.alliswell.booking;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

record BookingState(
        LinkedHashMap<String, Ticket> tickets,
        Map<String, Hold> holds,
        Map<String, Receipt> receipts) {

    BookingState() {
        this(new LinkedHashMap<>(), new LinkedHashMap<>(), new LinkedHashMap<>());
    }

    enum Status {
        WAITING, ADMITTED, COMPLETED
    }

    record Ticket(
            String sessionId, String owner, Status status, long expiresAt,
            long requestWindowStart, int requests) {

        Ticket withStatus(Status next, long deadline) {
            return new Ticket(sessionId, owner, next, deadline, requestWindowStart, requests);
        }

        Ticket withRequest(long now, long window) {
            if (requests == 0 || now - requestWindowStart >= window) {
                return new Ticket(sessionId, owner, status, expiresAt, now, 1);
            }
            return new Ticket(sessionId, owner, status, expiresAt, requestWindowStart, requests + 1);
        }
    }

    record Hold(String holdId, String sessionId, String flightKey, List<String> seats,
                long expiresAt, Quote quote) {}

    record Receipt(String reservationId, String sessionId, String flightKey, List<String> seats,
                   long confirmedAt, String owner, Quote quote, Long canceledAt) {
        Receipt canceled(long now) {
            return new Receipt(reservationId, sessionId, flightKey, seats, confirmedAt, owner, quote, now);
        }
    }

    record Quote(String offerId, String kind, String flightId, String airline, String flightNums,
                 String route, String date, String depTime, String arrTime, int dayDiff,
                 Integer durationMin, String cabin, int passengers, BigDecimal fare, BigDecimal seatFee,
                 String currency, long departureAt) {
        BigDecimal total() {
            return fare.add(seatFee);
        }
    }
}

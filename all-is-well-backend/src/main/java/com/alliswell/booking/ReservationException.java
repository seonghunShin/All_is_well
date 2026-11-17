package com.alliswell.booking;

import org.springframework.http.HttpStatus;

final class ReservationException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    ReservationException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    HttpStatus status() {
        return status;
    }

    String code() {
        return code;
    }
}

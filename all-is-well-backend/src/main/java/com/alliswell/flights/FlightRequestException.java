package com.alliswell.flights;

final class FlightRequestException extends RuntimeException {
    private final int status;

    FlightRequestException(int status, String message) {
        super(message);
        this.status = status;
    }

    int status() {
        return status;
    }
}

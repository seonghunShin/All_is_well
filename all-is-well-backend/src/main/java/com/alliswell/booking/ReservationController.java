package com.alliswell.booking;

import java.util.List;
import java.util.Map;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reservations")
class ReservationController {

    private static final String TOKEN_HEADER = "X-Queue-Token";
    private final ReservationService reservations;

    ReservationController(ReservationService reservations) {
        this.reservations = reservations;
    }

    @PostMapping("/queue")
    @ResponseStatus(HttpStatus.CREATED)
    ReservationService.QueueView join() {
        return reservations.join();
    }

    @GetMapping("/queue")
    ReservationService.QueueView status(@RequestHeader(name = TOKEN_HEADER, required = false) String token) {
        return reservations.status(token);
    }

    @PostMapping("/holds")
    @ResponseStatus(HttpStatus.CREATED)
    ReservationService.HoldView hold(@RequestHeader(name = TOKEN_HEADER, required = false) String token,
                                     @RequestBody HoldRequest request) {
        return reservations.hold(token, request.flightKey(), request.seats());
    }

    @DeleteMapping("/holds/{holdId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void release(@RequestHeader(name = TOKEN_HEADER, required = false) String token,
                 @PathVariable String holdId) {
        reservations.release(token, holdId);
    }

    @PostMapping("/holds/{holdId}/confirm")
    ReservationService.ReceiptView confirm(@RequestHeader(name = TOKEN_HEADER, required = false) String token,
                                           @PathVariable String holdId) {
        return reservations.confirm(token, holdId);
    }

    @ExceptionHandler(ReservationException.class)
    ResponseEntity<Map<String, String>> reservationError(ReservationException exception) {
        return ResponseEntity.status(exception.status())
                .body(Map.of("error", exception.getMessage(), "code", exception.code()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadableBody() {
        return reservationError(new ReservationException(
                HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "예약 요청 형식을 확인해 주세요."));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> storeUnavailable() {
        return reservationError(new ReservationException(
                HttpStatus.SERVICE_UNAVAILABLE, "BOOKING_STORE_UNAVAILABLE", "예약 저장소에 연결할 수 없어요."));
    }

    record HoldRequest(String flightKey, List<String> seats) {}
}

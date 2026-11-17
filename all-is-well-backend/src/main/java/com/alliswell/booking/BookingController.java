package com.alliswell.booking;

import java.util.List;
import java.util.Map;

import com.alliswell.auth.AccountSession;
import com.alliswell.flights.FlightOfferCatalog;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings")
class BookingController {

    private static final String TOKEN_HEADER = "X-Queue-Token";

    private final ReservationService reservations;
    private final FlightOfferCatalog offers;

    BookingController(ReservationService reservations, FlightOfferCatalog offers) {
        this.reservations = reservations;
        this.offers = offers;
    }

    @PostMapping("/queue")
    ResponseEntity<ReservationService.QueueView> join(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(reservations.join(owner(request)));
    }

    @GetMapping("/queue")
    ResponseEntity<ReservationService.QueueView> queue(
            HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token) {
        return privateResponse(reservations.status(owner(request), token));
    }

    @DeleteMapping("/queue")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void withdraw(HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token) {
        reservations.withdraw(owner(request), token);
    }

    @GetMapping("/availability")
    ResponseEntity<ReservationService.AvailabilityView> availability(
            HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token,
            @RequestParam("offerId") String offerId) {
        return privateResponse(reservations.availability(owner(request), token, () -> requireOffer(offerId)));
    }

    @PostMapping("/holds")
    ResponseEntity<ReservationService.HoldPriceView> hold(
            HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token,
            @RequestBody HoldRequest payload) {
        var hold = reservations.hold(owner(request), token, payload.offerId(), payload.seats(),
                () -> requireOffer(payload.offerId()));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(hold);
    }

    @DeleteMapping("/holds/{holdId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void release(HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token,
                 @PathVariable("holdId") String holdId) {
        reservations.release(owner(request), token, holdId);
    }

    @PostMapping("/holds/{holdId}/confirm")
    ResponseEntity<ReservationService.BookingView> confirm(
            HttpServletRequest request, @RequestHeader(name = TOKEN_HEADER, required = false) String token,
            @PathVariable("holdId") String holdId) {
        return privateResponse(reservations.confirm(owner(request), token, holdId));
    }

    @GetMapping
    ResponseEntity<BookingList> list(HttpServletRequest request) {
        return privateResponse(new BookingList(reservations.bookings(owner(request))));
    }

    @PostMapping("/{code}/cancel")
    ResponseEntity<ReservationService.BookingView> cancel(HttpServletRequest request, @PathVariable("code") String code) {
        return privateResponse(reservations.cancel(owner(request), code));
    }

    @ExceptionHandler(ReservationException.class)
    ResponseEntity<Map<String, String>> reservationError(ReservationException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(Map.of("error", exception.getMessage(), "code", exception.code()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> sessionError(ResponseStatusException exception) {
        String code = exception.getStatusCode().value() == 401 ? "LOGIN_REQUIRED" : "BOOKING_REQUEST_REJECTED";
        String message = exception.getReason() == null ? "예약 요청을 계속할 수 없어요." : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode()).cacheControl(CacheControl.noStore())
                .body(Map.of("error", message, "code", code));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
    ResponseEntity<Map<String, String>> invalidPayload() {
        return reservationError(new ReservationException(
                HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "예약 요청 형식을 확인해 주세요."));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<Map<String, String>> storeUnavailable() {
        return reservationError(new ReservationException(
                HttpStatus.SERVICE_UNAVAILABLE, "BOOKING_STORE_UNAVAILABLE", "예약 저장소에 연결할 수 없어요."));
    }

    private FlightOfferCatalog.Offer requireOffer(String offerId) {
        try {
            return offers.require(offerId);
        } catch (ResponseStatusException error) {
            if (error.getStatusCode().value() == 410) {
                throw new ReservationException(HttpStatus.GONE, "OFFER_EXPIRED", "조회 운임이 만료됐어요. 다시 검색해 주세요.");
            }
            if (error.getStatusCode().value() == 404) {
                throw new ReservationException(HttpStatus.NOT_FOUND, "OFFER_NOT_FOUND", "조회 운임을 찾을 수 없어요. 다시 검색해 주세요.");
            }
            throw error;
        }
    }

    private static String owner(HttpServletRequest request) {
        return AccountSession.requireOwner(request.getSession(false));
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    record HoldRequest(String offerId, List<String> seats) {}
    record BookingList(List<ReservationService.BookingView> bookings) {}
}

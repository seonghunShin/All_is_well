package com.alliswell.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
class AuthController {
    private static final int ATTEMPTS_PER_MINUTE = 10;
    private static final int MAX_CLIENTS = 1024;

    private final Accounts accounts;
    private final Map<String, AttemptWindow> attempts = new HashMap<>();

    AuthController(Accounts accounts) {
        this.accounts = accounts;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    Profile signup(@RequestBody Signup input, HttpServletRequest request) {
        countAttempt(request.getRemoteAddr());
        AccountSession.Account account = accounts.signup(input.name(), input.email(), input.password());
        AccountSession.start(request, account);
        return Profile.from(account);
    }

    @PostMapping("/login")
    Profile login(@RequestBody Login input, HttpServletRequest request) {
        countAttempt(request.getRemoteAddr());
        AccountSession.Account account = accounts.login(input.email(), input.password());
        AccountSession.start(request, account);
        return Profile.from(account);
    }

    @GetMapping("/me")
    Profile me(HttpServletRequest request) {
        return Profile.from(AccountSession.requireAccount(request.getSession(false)));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request) {
        AccountSession.end(request.getSession(false));
    }

    private synchronized void countAttempt(String client) {
        Instant now = Instant.now();
        attempts.values().removeIf(window -> !window.endsAt().isAfter(now));
        AttemptWindow window = attempts.get(client);
        if (window == null && attempts.size() < MAX_CLIENTS) {
            attempts.put(client, new AttemptWindow(now.plus(Duration.ofMinutes(1)), 1));
        } else if (window != null && window.count() < ATTEMPTS_PER_MINUTE) {
            attempts.put(client, new AttemptWindow(window.endsAt(), window.count() + 1));
        } else {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 로그인 또는 가입을 다시 시도해 주세요.");
        }
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> authError(ResponseStatusException exception) {
        String code = switch (exception.getStatusCode().value()) {
            case 401 -> "UNAUTHORIZED";
            case 409 -> "ACCOUNT_EXISTS";
            case 429 -> "AUTH_RATE_LIMITED";
            default -> "INVALID_AUTH_REQUEST";
        };
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("error", exception.getReason(), "code", code));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> invalidBody() {
        return authError(new ResponseStatusException(HttpStatus.BAD_REQUEST, "로그인 또는 가입 정보를 확인해 주세요."));
    }

    record Signup(String name, String email, String password) {
    }

    record Login(String email, String password) {
    }

    record Profile(String name, String email) {
        static Profile from(AccountSession.Account account) {
            return new Profile(account.name(), account.email());
        }
    }

    private record AttemptWindow(Instant endsAt, int count) {
    }
}

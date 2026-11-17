package com.alliswell.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class AccountSession {
    private static final String ACCOUNT = AccountSession.class.getName() + ".account";

    private AccountSession() {
    }

    public static String requireOwner(HttpSession session) {
        return requireAccount(session).id();
    }

    static Account requireAccount(HttpSession session) {
        if (session != null) {
            try {
                if (session.getAttribute(ACCOUNT) instanceof Account account) {
                    return account;
                }
            } catch (IllegalStateException ignored) {
                // A concurrent logout has already invalidated this session.
            }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요해요.");
    }

    static void start(HttpServletRequest request, Account account) {
        end(request.getSession(false));
        request.getSession(true).setAttribute(ACCOUNT, account);
    }

    static void end(HttpSession session) {
        if (session == null) {
            return;
        }
        try {
            session.invalidate();
        } catch (IllegalStateException ignored) {
            // Logout is idempotent when a session has already expired.
        }
    }

    record Account(String id, String name, String email) {
    }
}

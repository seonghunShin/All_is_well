package com.alliswell.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class BrowserSessionFilter extends OncePerRequestFilter {
    private static final Set<String> READ_METHODS = Set.of("GET", "HEAD", "OPTIONS");

    private final ObjectMapper json;

    BrowserSessionFilter(ObjectMapper json) {
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !path.equals("/api/bookings") && !path.startsWith("/api/bookings/")
                && !path.startsWith("/api/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        String origin = request.getHeader("Origin");
        String expected = request.getScheme() + "://" + request.getHeader("Host");
        if (!READ_METHODS.contains(request.getMethod()) && origin != null && !expected.equalsIgnoreCase(origin)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            json.writeValue(response.getOutputStream(), Map.of(
                    "error", "같은 사이트에서 요청해 주세요.", "code", "ORIGIN_MISMATCH"));
            return;
        }
        chain.doFilter(request, response);
    }
}

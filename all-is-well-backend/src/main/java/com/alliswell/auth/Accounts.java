package com.alliswell.auth;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class Accounts {
    private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s.]+(?:\\.[^@\\s.]+)+");
    private static final int SALT_BYTES = 16;
    private static final int HASH_BYTES = 32;
    private static final int HASH_ITERATIONS = 600_000;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    Accounts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    AccountSession.Account signup(String rawName, String rawEmail, String password) {
        String name = rawName == null ? "" : rawName.strip();
        if (name.isEmpty() || name.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이름을 1~80자로 입력해 주세요.");
        }
        String email = email(rawEmail);
        validatePassword(password);

        String id = UUID.randomUUID().toString();
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] hash = passwordHash(password, salt);
        try {
            jdbc.update("""
                    INSERT INTO accounts (id, email, display_name, password_salt, password_hash)
                    VALUES (?, ?, ?, ?, ?)
                    """, id, email, name, salt, hash);
        } catch (DuplicateKeyException duplicate) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입된 이메일이에요.");
        }
        return new AccountSession.Account(id, name, email);
    }

    AccountSession.Account login(String rawEmail, String password) {
        String email = email(rawEmail);
        validatePassword(password);
        Credentials credentials = jdbc.query("""
                SELECT id, display_name, password_salt, password_hash
                FROM accounts WHERE email = ?
                """, (row, rowNumber) -> new Credentials(
                        new AccountSession.Account(row.getString("id"), row.getString("display_name"), email),
                        row.getBytes("password_salt"),
                        row.getBytes("password_hash")), email)
                .stream()
                .findFirst()
                .orElse(null);

        // Unknown and known accounts perform the same password hash operation.
        byte[] salt = credentials == null ? new byte[SALT_BYTES] : credentials.salt();
        byte[] expected = credentials == null ? new byte[HASH_BYTES] : credentials.hash();
        boolean valid = MessageDigest.isEqual(expected, passwordHash(password, salt));
        if (!valid || credentials == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않아요.");
        }
        return credentials.account();
    }

    private static String email(String value) {
        String normalized = value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254 || !EMAIL.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 형식을 확인해 주세요.");
        }
        return normalized;
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < 6 || password.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호를 6~128자로 입력해 주세요.");
        }
    }

    private static byte[] passwordHash(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, HASH_ITERATIONS, HASH_BYTES * Byte.SIZE);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("비밀번호 해시를 생성할 수 없어요.", error);
        } finally {
            spec.clearPassword();
        }
    }

    private record Credentials(AccountSession.Account account, byte[] salt, byte[] hash) {
    }
}

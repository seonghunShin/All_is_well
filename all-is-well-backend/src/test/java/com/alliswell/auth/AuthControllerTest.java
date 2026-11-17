package com.alliswell.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AuthControllerTest {
    private static final String EMAIL = "demo@example.com";
    private static final String SIGNUP = """
            {"name":"Demo","email":" Demo@Example.com ","password":"test-only-123"}
            """;
    private static final String LOGIN = """
            {"email":"demo@example.com","password":"test-only-123"}
            """;

    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .generateUniqueName(true)
                .addScript("classpath:schema.sql")
                .build();
        jdbc = new JdbcTemplate(database);
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(new Accounts(jdbc))).build();
    }

    @AfterEach
    void closeDatabase() {
        database.shutdown();
    }

    @Test
    void signupPersistsCredentialsAndLoginCreatesANewSession() throws Exception {
        MockHttpSession first = (MockHttpSession) mvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON).content(SIGNUP))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(EMAIL))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andReturn().getRequest().getSession(false);
        assertThat(first).isNotNull();
        String owner = AccountSession.requireOwner(first);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM accounts WHERE id = ?", byte[].class, owner))
                .hasSize(32);
        assertThat(jdbc.queryForObject("SELECT password_salt FROM accounts WHERE id = ?", byte[].class, owner))
                .hasSize(16);

        mvc.perform(post("/api/auth/login").session(first)
                        .contentType(MediaType.APPLICATION_JSON).content(LOGIN.replace("test-only-123", "invalid")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        MockHttpSession second = (MockHttpSession) mvc.perform(post("/api/auth/login").session(first)
                        .contentType(MediaType.APPLICATION_JSON).content(LOGIN))
                .andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
        assertThat(first.isInvalid()).isTrue();
        assertThat(second).isNotNull();
        assertThat(second.getId()).isNotEqualTo(first.getId());
        assertThat(AccountSession.requireOwner(second)).isEqualTo(owner);

        mvc.perform(get("/api/auth/me").session(second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Demo"))
                .andExpect(jsonPath("$.id").doesNotExist());
        mvc.perform(post("/api/auth/logout").session(second)).andExpect(status().isNoContent());
        assertThat(second.isInvalid()).isTrue();
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout")).andExpect(status().isNoContent());
    }

    @Test
    void signupRejectsDuplicateNormalizedEmail() throws Exception {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(SIGNUP))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(SIGNUP.replace(" Demo@Example.com ", EMAIL)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ACCOUNT_EXISTS"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class)).isEqualTo(1);
    }

    @Test
    void boundsAuthAttemptsFromTheSameClient() throws Exception {
        for (int index = 0; index < 10; index++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(LOGIN))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AUTH_RATE_LIMITED"));
    }
}

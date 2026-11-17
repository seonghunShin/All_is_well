CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    password_salt VARBINARY(16) NOT NULL,
    password_hash VARBINARY(32) NOT NULL
);

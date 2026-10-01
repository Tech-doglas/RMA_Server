IF OBJECT_ID('RMA_revoked_sessions', 'U') IS NULL
BEGIN
    CREATE TABLE RMA_revoked_sessions (
        token_hash VARCHAR(64) PRIMARY KEY,
        expires_at BIGINT NOT NULL
    );
END;

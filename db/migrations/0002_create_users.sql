-- Users table (roadmap stage 3 — per-user auth). Password is stored as a
-- bcrypt hash, never plaintext. Linking accounts/transactions to a user_id
-- (ownership enforcement) is deferred to S4 — this migration only adds the
-- authentication identity, not authorization.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accounts and transactions, minimal shape for the first end-to-end
-- transaction (roadmap stage 2). No users/auth table yet — that
-- arrives at roadmap stage 3. Money is `numeric(14,2)`: exact decimal
-- storage, no floating-point rounding error.

CREATE TABLE accounts (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    current_balance NUMERIC(14,2) NOT NULL,
    reference_date  DATE NOT NULL
);

CREATE TABLE transactions (
    id          SERIAL PRIMARY KEY,
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    type        TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount      NUMERIC(14,2) NOT NULL,
    occurred_on DATE NOT NULL,
    category    TEXT
);

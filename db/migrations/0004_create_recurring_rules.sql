-- Confirmed recurring income/expense rules, read by the 30-day
-- forecast (roadmap stage 5). Monthly only for now — weekly/daily can
-- be added later if a real need shows up (YAGNI). day_of_month clamps
-- to the last day of the month when it doesn't exist (e.g. 31 in a
-- 30-day month) — decided with the user, brief §11 rule 5.

CREATE TABLE recurring_rules (
    id            SERIAL PRIMARY KEY,
    account_id    INTEGER NOT NULL REFERENCES accounts(id),
    type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount        NUMERIC(14,2) NOT NULL,
    frequency     TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency = 'monthly'),
    day_of_month  INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    category      TEXT,
    active        BOOLEAN NOT NULL DEFAULT true
);

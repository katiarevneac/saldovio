-- Ownership enforcement (roadmap stage 3, S4). accounts.user_id links
-- every account to its owner; Finance API will filter/verify against it
-- on every read and write, per brief §12 ("never trust a userId sent by
-- the browser").
--
-- Added nullable first so the existing dev account can be backfilled
-- before the NOT NULL constraint is applied — a fresh install has no
-- pre-existing rows and would skip straight to NOT NULL in a real
-- migration tool, but this repo runs plain .sql files by hand.

ALTER TABLE accounts ADD COLUMN user_id INTEGER REFERENCES users(id);

UPDATE accounts SET user_id = (SELECT id FROM users WHERE email = 'test@example.com')
WHERE name = 'Cont curent';

ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;

-- AlterTable
-- configured has a real DB default (true) deliberately — ADR 0003 §3,
-- safe for every existing account since none of them have ever had any
-- "unconfigured" notion; only the signup flow overrides it to false.
ALTER TABLE "accounts" ADD COLUMN     "configured" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "opening_boundary" TEXT;

-- Backfill: every existing row keeps the formula it was always computed
-- under (ADR 0002) — this is stating the already-true formula in the
-- schema, not reinterpreting any stored balance.
UPDATE "accounts" SET "opening_boundary" = 'legacy_inclusive' WHERE "opening_boundary" IS NULL;

-- opening_boundary gets no Prisma-level default (ADR 0002 — every write
-- path must set it explicitly), so it's added nullable above, backfilled,
-- then locked to NOT NULL here.
ALTER TABLE "accounts" ALTER COLUMN "opening_boundary" SET NOT NULL;

-- Prisma's schema language can't express CHECK constraints (same
-- limitation noted in 0_init's tail for transactions/recurring_rules,
-- and in 20260915115024 for the settings range checks) — hand-appended
-- here, matching that precedent.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opening_boundary_check" CHECK ("opening_boundary" IN ('legacy_inclusive', 'start_of_day'));

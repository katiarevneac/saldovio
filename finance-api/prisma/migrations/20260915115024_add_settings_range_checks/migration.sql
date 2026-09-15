-- AddCheckConstraint
-- Prisma's schema language can't express CHECK constraints (same
-- limitation noted in 0_init's tail for transactions/recurring_rules) —
-- hand-appended here, matching that precedent. Bounds Settings.payday to
-- the same 1-31 range the Zod DTO already enforces, and Settings.horizonDays
-- to 1-365 (belt-and-suspenders below the Zod max(365) — closing Finding 1
-- of the Epic 11 Story 1 final review: an unbounded horizonDays is an
-- availability risk at every layer that turns it into a loop bound or an
-- allocation count).
ALTER TABLE "public"."users" ADD CONSTRAINT "users_payday_check" CHECK (payday IS NULL OR (payday >= 1 AND payday <= 31));

ALTER TABLE "public"."users" ADD CONSTRAINT "users_horizon_days_check" CHECK (horizon_days >= 1 AND horizon_days <= 365);

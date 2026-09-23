-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "lifecycle" TEXT NOT NULL DEFAULT 'actual';

-- Prisma's schema language can't express CHECK constraints (same
-- precedent as transactions.type/recurring_rules in 0_init and the
-- settings range checks in 20260915115024). Narrower than
-- financial-rules.md §4's full enum on purpose — voided/adjustment
-- widen this later (Epic 16 Story 1) once edit/void exists.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_lifecycle_check" CHECK ("lifecycle" IN ('actual', 'planned'));

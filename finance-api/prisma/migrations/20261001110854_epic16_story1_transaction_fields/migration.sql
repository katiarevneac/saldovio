-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "description" TEXT,
ADD COLUMN     "transfer_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "transactions_transfer_id_idx" ON "transactions"("transfer_id");

-- Prisma's schema language can't express CHECK constraints (same
-- precedent as transactions.type/recurring_rules in 0_init,
-- transactions.lifecycle's first narrow version in
-- 20260923122635, and the settings range checks in 20260915115024).
-- Widens the existing transactions_lifecycle_check to add 'voided'
-- (Epic 16 Story 1 — the comment in schema.prisma that named this
-- migration ahead of time).
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_lifecycle_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_lifecycle_check" CHECK ("lifecycle" IN ('actual', 'planned', 'voided'));

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "protected_savings" BOOLEAN NOT NULL DEFAULT false;

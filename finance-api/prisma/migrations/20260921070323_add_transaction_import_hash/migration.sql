/*
  Warnings:

  - A unique constraint covering the columns `[account_id,import_hash]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "import_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_import_hash_key" ON "transactions"("account_id", "import_hash");

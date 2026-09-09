-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "current_balance" DECIMAL(14,2) NOT NULL,
    "reference_date" DATE NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recurring_rules" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "day_of_month" INTEGER NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "category" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint
-- Prisma's introspection cannot express CHECK constraints, so these are
-- appended by hand to keep this migration file an accurate record of what
-- `saldovio_dev` actually enforces (verified via `\d+ transactions` /
-- `\d+ recurring_rules` and matched to the original hand-written SQL in
-- db/migrations/0001_create_accounts_and_transactions.sql and
-- db/migrations/0004_create_recurring_rules.sql). Not applied to the live
-- database here — it already has them; this only corrects what the file
-- says happened, for anyone provisioning a fresh database from it later.
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_type_check" CHECK (type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text]));

ALTER TABLE "public"."recurring_rules" ADD CONSTRAINT "recurring_rules_type_check" CHECK (type = ANY (ARRAY['income'::text, 'expense'::text]));

ALTER TABLE "public"."recurring_rules" ADD CONSTRAINT "recurring_rules_frequency_check" CHECK (frequency = 'monthly'::text);

ALTER TABLE "public"."recurring_rules" ADD CONSTRAINT "recurring_rules_day_of_month_check" CHECK (day_of_month >= 1 AND day_of_month <= 31);


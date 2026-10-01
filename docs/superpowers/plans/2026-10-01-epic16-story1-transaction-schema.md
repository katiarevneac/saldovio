# Epic 16 Story 1 — Transaction schema (description, transferId, version, lifecycle widen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four schema elements every later Epic 16 story depends on — `Transaction.description`, `Transaction.transferId`, `Transaction.version`, and widening the `lifecycle` CHECK to allow `'voided'` — with no behavior built on top of them yet (that's Stories 2/3/5/7/9's job).

**Architecture:** One Prisma migration, following the project's established "hand-append the `ALTER TABLE ... ADD CONSTRAINT` Prisma can't express" pattern (precedent: `20260923122635_add_transaction_lifecycle`, which this story's own comment already names as the migration that will widen it). No controller, DTO, or service changes — this is schema-only, verified by exercising the Prisma Client directly against the columns/constraint, same proof pattern as `users.service.spec.ts`'s existing `horizonDays` CHECK test.

**Tech Stack:** NestJS, Prisma 7, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-epic16-transactions-transfers-import-design.md` §3 (Schema), §2 (non-negotiables this must not violate).

## Global Constraints

- Money stays `NUMERIC(14,2)`/`Decimal.js` — this story adds no monetary column, but any future task touching `amount` must keep this.
- No `Date` object for date arithmetic/comparison (financial-rules.md §3) — not touched by this story (no new date column), noted because `occurredOn` sits right next to the columns this story does add.
- Every CHECK constraint Prisma's schema language can't express gets hand-appended to the generated migration SQL, never left as an application-only check — same as `transactions_type_check`, `recurring_rules.day_of_month`, `users_horizon_days_check`.
- `importBatchId`/`ImportBatch` are explicitly **not** part of this story — they're Story 6's job, created together with the `ImportBatch` table in one migration so the FK target exists before the FK does. Don't add a dangling column here.
- `Category`/`CategorizationRule` are Story 9's job — not touched here.

## Review Focus

- A `lifecycle` value outside `('actual', 'planned', 'voided')` (e.g. `'archived'`, empty string) must still be rejected at the DB CHECK — widening the constraint must not accidentally loosen it to accept anything.
- Existing rows (inserted before this migration) must get `version: 0`, `description: null`, `transferId: null` as real column defaults, not `undefined`/missing — a migration that adds a `NOT NULL` column without a default would break every existing row.
- `transferId` must accept a well-formed UUID string and reject a plain non-UUID string (the column is `@db.Uuid`, a real Postgres type, not `String` text) — a later story writing a malformed id should fail loudly at the DB, not silently store garbage.
- The existing `@@unique([accountId, importHash])` constraint and the `transactions_type_check`/`transactions_lifecycle_check` CHECKs from prior migrations must survive this migration untouched — a `prisma migrate dev` that regenerates the whole table definition could silently drop one if the SQL is hand-edited carelessly.
- `version`'s default must be `0` for every pre-existing row and every newly inserted row that doesn't explicitly set it — Story 2's optimistic-concurrency check (`PATCH` comparing caller-sent `version` against stored `version`) depends on this starting point being consistent, not nullable.

---

### Task 1: Transaction schema migration

**Files:**
- Modify: `finance-api/prisma/schema.prisma:49-67` (Transaction model)
- Create: `finance-api/prisma/migrations/<timestamp>_epic16_story1_transaction_fields/migration.sql`
- Modify: `finance-api/src/transactions/transactions.service.spec.ts` (new tests, appended to the existing `describe('TransactionsService', ...)` block)

**Interfaces:**
- Consumes: nothing from earlier Epic 16 work (this is the first task).
- Produces: `Transaction.description: string | null`, `Transaction.transferId: string | null` (UUID), `Transaction.version: number` (default `0`), `Transaction.lifecycle` now also accepts `'voided'` at the DB level. Every later Epic 16 task reads/writes these exact field names — `transferId` (camelCase in Prisma Client, `transfer_id` column), `version`, `description`.

- [ ] **Step 1: Write the failing tests**

Append to `finance-api/src/transactions/transactions.service.spec.ts` (inside the existing top-level `describe` block, using the existing `prisma`/`accountId`/`userId` from `beforeEach`):

```typescript
describe('Epic 16 Story 1 — schema additions', () => {
  it('defaults version to 0 and description/transferId to null on a plain insert', async () => {
    const transaction = await prisma.transaction.create({
      data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
    });

    expect(transaction.version).toBe(0);
    expect(transaction.description).toBeNull();
    expect(transaction.transferId).toBeNull();
  });

  it('accepts a well-formed UUID in transferId', async () => {
    const transferId = '11111111-1111-1111-1111-111111111111';
    const transaction = await prisma.transaction.create({
      data: {
        accountId,
        type: 'transfer',
        amount: new Prisma.Decimal(-500),
        occurredOn: fromDateOnlyString('2026-10-01'),
        transferId,
      },
    });

    expect(transaction.transferId).toBe(transferId);
  });

  it('rejects a non-UUID string in transferId at the database type level', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO transactions (account_id, type, amount, occurred_on, transfer_id)
        VALUES (${accountId}, 'transfer', -500, ${fromDateOnlyString('2026-10-01')}, 'not-a-uuid')`,
    ).rejects.toThrow();
  });

  it('accepts lifecycle "voided" at the database CHECK constraint', async () => {
    const transaction = await prisma.transaction.create({
      data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
    });

    const voided = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { lifecycle: 'voided' },
    });

    expect(voided.lifecycle).toBe('voided');
  });

  it('still rejects a lifecycle value outside actual/planned/voided at the database CHECK constraint', async () => {
    const transaction = await prisma.transaction.create({
      data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
    });

    await expect(
      prisma.transaction.update({ where: { id: transaction.id }, data: { lifecycle: 'archived' } }),
    ).rejects.toThrow();
  });

  it('can update version independently, for a future optimistic-concurrency check to compare against', async () => {
    const transaction = await prisma.transaction.create({
      data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
    });

    const bumped = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { version: { increment: 1 } },
    });

    expect(bumped.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: FAIL — `Unknown argument 'transferId'`/`'version'`/`'description'` (Prisma Client doesn't know these fields yet), and the `'voided'` test fails with a CHECK-violation error (the constraint doesn't allow it yet).

- [ ] **Step 3: Edit the Prisma schema**

In `finance-api/prisma/schema.prisma`, replace the `Transaction` model (lines 49-67) with:

```prisma
model Transaction {
  id         Int      @id @default(autoincrement())
  accountId  Int      @map("account_id")
  account    Account  @relation(fields: [accountId], references: [id])
  type       String
  amount     Decimal  @db.Decimal(14, 2)
  occurredOn DateTime @map("occurred_on") @db.Date
  category   String?
  importHash String?  @map("import_hash")
  // financial-rules.md §4's full lifecycle enum is actual/planned/
  // voided/adjustment. Epic 16 Story 1 widens the CHECK to add
  // 'voided' (Story 2 is what actually writes it, via a void
  // endpoint) — adjustment still has no write path anywhere, so the
  // CHECK deliberately does not yet include it.
  // DB default 'actual' is safe: every existing row genuinely is one.
  lifecycle  String   @default("actual")
  // Epic 16 Story 1: free-text description, separate from `category`.
  // Story 7 (import) populates this from the CSV's own Description
  // column instead of discarding it (closes F18/F06's description
  // loss); manual transaction creation can set it too, no restriction
  // at the schema level.
  description String?
  // Epic 16 Story 1: optimistic-concurrency counter. Starts at 0 for
  // every row (existing and new, via the column default — not
  // application code, so it holds even for a direct SQL insert).
  // Story 2's edit/void/restore endpoints require the caller's
  // last-known value and bump this on every write; a mismatch is a
  // stale read, not a data race silently overwritten.
  version    Int      @default(0)
  // Epic 16 Story 1: shared by exactly 2 rows that together form one
  // transfer (financial-rules.md §2 — source leg negative, destination
  // leg positive, different accountId). Null for every non-transfer
  // row. No DB-level "exactly 2 rows summing to zero" constraint —
  // Postgres can't express a cross-row aggregate CHECK; Story 3's
  // create-transfer endpoint enforces this inside one
  // prisma.$transaction instead, same as atomic signup already does
  // for a different invariant.
  transferId String?  @db.Uuid @map("transfer_id")

  @@unique([accountId, importHash])
  @@index([transferId])
  @@map("transactions")
}
```

- [ ] **Step 4: Generate the migration**

Run: `cd finance-api && npx prisma migrate dev --create-only --name epic16_story1_transaction_fields`
Expected: a new directory under `finance-api/prisma/migrations/` containing a `migration.sql` with `ALTER TABLE "transactions" ADD COLUMN "description" TEXT; ALTER TABLE "transactions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0; ALTER TABLE "transactions" ADD COLUMN "transfer_id" UUID; CREATE INDEX ...` (exact statement order/wording may vary — Prisma generates it).

- [ ] **Step 5: Hand-append the lifecycle CHECK widening**

Open the generated `migration.sql` and append, following the exact precedent in `20260923122635_add_transaction_lifecycle/migration.sql`:

```sql
-- Prisma's schema language can't express CHECK constraints (same
-- precedent as transactions.type/recurring_rules in 0_init,
-- transactions.lifecycle's first narrow version in
-- 20260923122635, and the settings range checks in 20260915115024).
-- Widens the existing transactions_lifecycle_check to add 'voided'
-- (Epic 16 Story 1 — the comment in schema.prisma that named this
-- migration ahead of time).
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_lifecycle_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_lifecycle_check" CHECK ("lifecycle" IN ('actual', 'planned', 'voided'));
```

- [ ] **Step 6: Apply the migration**

Run: `cd finance-api && npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 7: Regenerate the Prisma Client**

Run: `cd finance-api && npx prisma generate`
Expected: completes with no errors; `finance-api/src/generated/prisma` now has `description`/`version`/`transferId` on the `Transaction` type.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: PASS, all tests in the file including the 6 new ones.

- [ ] **Step 9: Run the full finance-api test suite to confirm no regressions**

Run: `cd finance-api && npx vitest run`
Expected: PASS (same count as before this story, plus the 6 new tests). If any pre-existing test fails, stop and diagnose before continuing — do not proceed with a red suite.

- [ ] **Step 10: Type-check and lint**

Run: `cd finance-api && npx tsc --noEmit && npx oxlint`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
cd finance-api
git add prisma/schema.prisma prisma/migrations src/transactions/transactions.service.spec.ts
git commit -m "feat: add Transaction.description/version/transferId, widen lifecycle CHECK (Epic 16 Story 1)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

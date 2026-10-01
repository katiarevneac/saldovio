# Epic 16 — Transactions, transfers & import correctness (S05+S06 merged)

Date: 2026-10-01
Status: Approved for planning
Scope: `docs/roadmap/2026-09-23-epic-sprint-backlog.md`'s Epic 16, all 3 sprints (10 stories), brainstormed as one design per the user's explicit choice to design the whole epic up front rather than per-sprint.

## 1. Why

Closes real, demonstrated gaps, not speculative ones:

- **No transfer write path exists.** `Transaction.type` already allows `'transfer'` in the DB `CHECK` and the create DTO (`finance-api/src/transactions/dto/create-transaction.dto.ts`), but no UI ever creates one — `TransactionForm.tsx` only offers Expense/Income. A user moving money between their own accounts today has no correct way to record it; faking it as income-on-B + expense-on-A is exactly the double-count brief §11 rule 1 forbids.
- **F04** — CSV `Currency` column is parsed into the dedupe hash but never validated; a EUR/USD statement row imports silently as if it were RON.
- **F05** — import classifies every row by amount sign alone; a transfer between the user's own accounts imports as fabricated income or expense.
- **F06** — the parser captures `Description` but `ImportCommitSchema` has no field for it; only Revolut's raw `Type` column (e.g. `CARD_PAYMENT`) survives, as `category`. The real merchant description is discarded.
- **F16** — `csvEscape` does RFC4180 quoting only; no formula-injection guard, no export BOM.
- **F18** — `/import/commit` trusts client-supplied `hash`/`occurredOn`/`type`/`amount`/`category` directly; nothing server-side ties a commit back to the preview that produced it.
- **F07** — transaction edit/void/restore has no endpoint at all; a mis-entered transaction cannot be corrected or removed without a direct DB write.
- Categories are a freeform string with no standard set, no per-user ownership, no recategorization, no auto-assignment.

## 2. Non-negotiables this design must not violate

From `CLAUDE.md` and `docs/financial-rules.md`, carried into every story below:

- Money stays `NUMERIC(14,2)` / `Decimal.js` / bani — never a float, never `parseFloat` on a decimal string.
- No `Date` object for date arithmetic/comparison anywhere in the stack (financial-rules.md §3) — this design adds a 6th independent string-math enforcement point, not an exception.
- Browser never talks to Postgres directly; every new endpoint goes through Finance API's existing `InternalAuthGuard` + owner-scoped query pattern.
- Transfers: two linked legs, shared ID, atomically committed (financial-rules.md §2) — not two unlinked opposite-signed rows.
- No fabricated values; `financial-rules.md` §4's lifecycle table (`actual`/`planned`/`voided`/`adjustment`) is the authority for what each state means and this design widens the `CHECK`, doesn't redefine the table.

## 3. Schema (Story 1)

One migration, following the project's established "hand-append `CHECK` constraints Prisma can't express" pattern (precedent: `recurring_rules.day_of_month`, `transactions.lifecycle`).

```prisma
model Transaction {
  id            Int      @id @default(autoincrement())
  accountId     Int      @map("account_id")
  account       Account  @relation(fields: [accountId], references: [id])
  type          String
  amount        Decimal  @db.Decimal(14, 2)
  occurredOn    DateTime @map("occurred_on") @db.Date
  category      String?
  description   String?  // Story 1: separate from category (closes F06 at the schema level)
  importHash    String?  @map("import_hash")
  lifecycle     String   @default("actual") // CHECK widens to add 'voided'
  version       Int      @default(0)        // optimistic concurrency, bumped by every edit/void/restore
  transferId    String?  @db.Uuid @map("transfer_id") // shared by exactly 2 rows; null for non-transfer rows
  importBatchId Int?     @map("import_batch_id")
  importBatch   ImportBatch? @relation(fields: [importBatchId], references: [id])

  @@unique([accountId, importHash])
  @@map("transactions")
}
```

`transferId` has **no DB-level "exactly 2 rows, opposite signs, sum to zero" constraint** — Postgres can't express a cross-row aggregate CHECK, and a trigger would be the first one in this codebase for a project that has otherwise kept all financial invariants in application code reviewed by tests. The invariant is enforced the same way atomic signup and atomic transfer-legs already are: inside one `prisma.$transaction` call, both legs are created or neither is, and a unit test forces a mid-transaction failure to prove the rollback (same proof standard as Epic 15 Story 2's `$transaction` rollback test).

`ImportBatch` (new table, Story 6):

```prisma
model ImportBatch {
  id            Int      @id @default(autoincrement())
  userId        Int      @map("user_id")
  accountId     Int      @map("account_id")
  createdAt     DateTime @default(now()) @map("created_at")
  expiresAt     DateTime @map("expires_at") // createdAt + 24h, written at insert time
  parserVersion String   @map("parser_version")
  rows          ImportStagedRow[]
  transactions  Transaction[]
  @@map("import_batches")
}

model ImportStagedRow {
  id           Int      @id @default(autoincrement())
  batchId      Int      @map("batch_id")
  batch        ImportBatch @relation(fields: [batchId], references: [id])
  rowIndex     Int      @map("row_index")
  hash         String
  status       String   // 'valid' | 'duplicate' | 'error' | 'skipped'
  description  String?
  occurredOn   String?  @map("occurred_on") // YYYY-MM-DD string, not DateTime — no Date-object round-trip needed before commit
  type         String?
  amount       String?  // decimal string, not Decimal — this is staged/unconfirmed, not a ledger row yet
  category     String?
  reason       String?
  suggestedTransferPairTransactionId Int? @map("suggested_transfer_pair_transaction_id") // Story 5, cross-account match
  @@map("import_staged_rows")
}
```

`Category` and `CategorizationRule` (Story 9) — see §7.

## 4. Transfers (Stories 1 + 3)

`POST /transactions/transfer`:

```
{ sourceAccountId, destinationAccountId, amount, occurredOn, category? }
```

- Both accounts must belong to the caller — checked before any write (`assertOwnsAccount` on each, reusing the existing helper).
- `sourceAccountId !== destinationAccountId`, rejected 400 otherwise.
- `amount` positive (magnitude); the endpoint derives the signed legs, not the caller.
- Inside one `prisma.$transaction`: insert leg A (`accountId: source`, `type: 'transfer'`, `amount: -magnitude`), leg B (`accountId: destination`, `type: 'transfer'`, `amount: +magnitude`), both sharing a freshly generated `transferId` (uuid).
- Both legs get the same `occurredOn` and `category`.

Web: the existing add-transaction modal (`AddTransactionModal` + `TransactionForm`) gets a 3rd `type` option, `"transfer"`. Selecting it swaps the single account `<select>` for two (`source`, `destination`), reusing the same accounts list already fetched for the form. `createTransactionAction` branches to a new `createTransferAction` Server Action calling the new endpoint, same error-handling path as today.

Editing a transfer (Story 2) operates on the linked pair as one unit — see §5.

## 5. Edit / void / restore (Story 2)

- `PATCH /transactions/:id` — body is `{version, amount?, occurredOn?, category?, description?}`; `version` is required (the caller's last-known value), 409 on mismatch against the stored row (stale read — the caller must re-fetch and retry, same pattern a 409 implies everywhere else in this codebase). If the row has a `transferId`, the endpoint loads both legs, applies the amount as the opposite-signed pair, and writes both inside one `$transaction` — a transfer is edited as a unit, never one leg alone.
- `POST /transactions/:id/void` — `lifecycle: 'actual' → 'voided'`, bumps `version`. A `transferId` row voids both legs together, same atomicity rule.
- `POST /transactions/:id/restore` — `'voided' → 'actual'` only; any other current state 400s (no restoring a `planned` or `adjustment` row through this endpoint — restore means "undo a void," not "change lifecycle").
- `GET /transactions/:id/impact-preview` — read-only, no mutation. Computes, for the affected account(s), balance-before vs. balance-after the pending edit/void, and whether `occurredOn` falls on/before the account's `reference_date` (the Epic 4 "known limitation — backdated transactions" case: an edit to a pre-reference-date row has *no* visible balance effect, and the preview says so explicitly rather than showing a misleading zero delta). No obligation-match or reconciliation section yet — Epic 17/20 add their own fields to this same response shape when they exist; this design doesn't block that, it just doesn't fabricate sections for features that aren't built.

Ownership: every one of these checks `account.userId === caller` before touching a row, same pattern as every existing mutation (`assertOwnsAccount`).

## 6. Import correctness (Sprint 2, Stories 4–7)

**Story 4 — currency validation.** `parseRecord` checks `record.Currency !== 'RON'` before anything else; non-RON rows get `status: 'error'`, `reason: 'Currency is "EUR", not RON'` (never silently imported, never silently dropped — same "report, don't drop" convention the `State !== 'COMPLETED'` check already uses).

**Story 6 — server-staged batch.** `/transactions/import/preview` (multipart, unchanged input contract) now:
1. Runs the existing parser.
2. Writes one `ImportBatch` row (`expiresAt = now + 24h`) and one `ImportStagedRow` per parsed row.
3. Returns `{batchId, rows: [{id, status, description, occurredOn, type, amount, category, reason, suggestedTransferPairRowId?, suggestedTransferPairTransactionId?}]}` — same shape the client already renders, plus `id`/`batchId`.

`/transactions/import/commit` changes shape: `{batchId, selectedRowIds: number[]}` — **no amount, hash, date, or category in the request body.** The service re-reads its own `ImportStagedRow`s for that batch (rejecting if `batch.expiresAt < now`, or if `batch.userId/accountId` doesn't match the caller/request — same ownership check as everywhere else), filters to `selectedRowIds` ∩ `status: 'valid'`, and builds the `Transaction` rows from server-held data via `createMany({skipDuplicates: true})`, same race-safe pattern Epic 11 Story 4's commit already uses, each row stamped with `importBatchId`. This is the structural fix for F18 — the server is the only source of the values that become money.

A re-preview of the same file creates a *new* batch; the existing `@@unique([accountId, importHash])` constraint on `Transaction` still does the real dedupe work at commit time (unchanged from Epic 11), so re-importing doesn't double-insert even across separate batches.

**Story 5 — transfer-pair suggestions.** Self-review correction: `ImportBatch.accountId` is singular — one CSV belongs to one account — so a transfer's two legs, which by definition touch two *different* accounts, can never both appear in the same batch. "Within-batch" matching was in an earlier draft of this design and has been dropped as structurally impossible; **cross-account matching is the only mechanism**, matching the user's own framing of the decision (pairing against "existing unmatched transactions" in other accounts).

1. For each `valid` staged row, query the user's *other* accounts for an existing `Transaction` (`lifecycle: 'actual'`, `transferId: null`) with equal magnitude, opposite sign, `occurredOn` within ±3 days.
2. A match sets `suggestedTransferPairTransactionId` on the staged row; the preview response surfaces it, the UI shows a "this looks like a transfer — pair it?" affordance per matched row.
3. On commit, a row confirmed as a pair creates linked transfer legs: the already-committed existing `Transaction` and the new staged row are joined by a freshly generated `transferId` (the existing row gets `UPDATE`d to carry it, inside the same `$transaction` as the new row's insert) — reusing §4's atomicity rule, not its insert-both-legs path, since one leg already exists. An unconfirmed suggestion commits as a normal income/expense row, unchanged from today — suggestions never auto-apply.

**Story 7 — description preserved.** `ImportStagedRow.description` (and ultimately `Transaction.description`) carries the parser's `Description` field end to end. `category` keeps today's behavior — Revolut's `Type` column, freeform string — per the sequencing decision below; Story 9 is what changes category's representation, not Story 7.

## 7. Export hardening (Story 8)

`csvEscape`: before the existing RFC4180 quoting, a value starting with `=`, `+`, `-`, `@`, tab, or CR gets a leading `'` prepended (the standard Excel/Sheets/LibreOffice formula-injection guard — a leading `'` forces text interpretation in every mainstream spreadsheet app without changing the visible value). `exportCsv`'s returned string is prefixed with `﻿` (UTF-8 BOM) so Excel reliably detects UTF-8 rather than guessing a legacy codepage — closes F16 fully; the quoting half was already correct, injection-guard and BOM were the actual gaps.

## 8. Categories (Story 9)

Full scope, per the user's explicit choice over the narrower "categories only, rules deferred" option.

```prisma
model Category {
  id     Int    @id @default(autoincrement())
  userId Int?   @map("user_id") // null = standard/seeded, read-only to every user
  name   String
  @@unique([userId, name])
  @@map("categories")
}

model CategorizationRule {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  pattern    String   // case-insensitive substring match against Transaction.description
  categoryId Int      @map("category_id")
  category   Category @relation(fields: [categoryId], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("categorization_rules")
}
```

- **Seed migration** inserts a standard set with `userId: null`: Groceries, Rent, Transport, Utilities, Salary, Transfer, Fee, Healthcare, Entertainment, Other. Standard categories are read-only (no edit/delete endpoint accepts a null-`userId` row as a target); users create their own via `POST /categories`.
- **Migration of existing data**: `Transaction.category` (string) → `categoryId Int?` (FK), in the same migration, no intermediate dual-write period (matches this project's standing "no backwards-compat shim" rule). A data-migration step: for each distinct `(userId, category_string)` pair currently in use, create (or reuse) a user-owned `Category` with that name, point every matching `Transaction` row at its id. Rows with `category: null` stay `categoryId: null`. The old `category` string column is dropped in the same migration.
- **Pattern matching** is plain case-insensitive substring, not regex — deliberately, to avoid a ReDoS surface for a single-user-entered pattern field, consistent with this project's preference for the simplest mechanism that's actually needed (see simulator/forecast's repeated "no unbounded loop" findings).
- **Where rules apply**: on manual transaction create and on import commit (Story 6's commit path), before the row is written — first matching rule (by `createdAt` ascending, i.e. oldest-created-first — simple, deterministic, documented) wins; no match leaves `categoryId: null`. `POST /categorization-rules/apply` runs the same matching pass retroactively over the caller's existing `categoryId: null` transactions, atomically, for the explicit "apply my rules to old data" action — never runs automatically in the background.
- `PATCH /transactions/bulk-categorize` — `{transactionIds: number[], categoryId}`, ownership-checked on every id, atomic — for manual multi-select recategorization from the Transactions page.

## 9. Batch history / undo-import (Story 10)

- `GET /import-batches` — caller's own batches, `{id, accountId, createdAt, rowCount, committedCount}`. `ImportBatch` is a permanent record from Story 6 onward; the 24h `expiresAt` only blocks *re-committing* a stale preview, it does not delete the batch row.
- `POST /import-batches/:id/undo` — voids (not deletes) every `Transaction` with that `importBatchId`, inside one `$transaction`, reusing §5's void endpoint logic directly (same lifecycle transition, same `version` bump). **Self-review correction:** a row created via §6 Story 5's confirmed transfer-pair path shares a `transferId` with a leg that may belong to a *different* batch, or be a manual entry — that leg has no matching `importBatchId` and would otherwise be silently skipped, leaving one leg voided and its partner intact (breaking the zero-sum invariant §5 requires for any `transferId` row). Undo therefore resolves each batch row's `transferId` first and voids the full linked set, not just rows matching `importBatchId` — same "a transfer voids as a unit" rule as §5, applied transitively across batch boundaries. Ownership-checked on the batch itself, and on any cross-batch partner leg's account, before touching any row.

## 10. Testing

Each story gets its own unit/integration tests following this project's established pattern (no mocking of the DB in finance-api integration tests; real `saldovio_dev`/test DB). Specifically load-bearing tests this design calls for, beyond normal coverage:

- A forced mid-`$transaction` failure proving transfer-leg atomicity (D10) — same proof standard as every prior atomic-write story in this project.
- D07: EUR/USD/RON mixed CSV → only RON rows reach staging as `valid`.
- D08: committing the same batch twice (double-click, retry) → exactly one set of transactions, not two (the existing `@@unique` constraint plus `skipDuplicates` already gives this; a test proves it holds through the new batch-based commit path too).
- D09: two legitimately identical payments (same amount, same date, same description) are not silently deduped against each other — `import_hash` already includes enough file-verbatim fields that two real separate transactions produce different hashes only if the source file actually distinguishes them; this design doesn't change dedupe fingerprinting, a regression test confirms it still doesn't change.
- D11: an import row suggested (not auto-applied) as a transfer pair, left unconfirmed, commits as ordinary income/expense — never silently reclassified.
- D24: a category/description containing `=cmd|...` or similar exports with the leading-`'` guard and round-trips through `csvEscape`'s existing quoting unchanged in meaning.
- D25: an oversized staged-row `amount`/`pattern`/`name` field is bounded (reuses the existing `.max()` convention already applied everywhere else per S04.15's DTO-length audit).

## 11. Sequencing within the epic

Stories build in the backlog's own order (1 → 2 → 3 → … → 10) because later stories depend on earlier schema: Story 3 needs Story 1's `transferId`; Story 5 needs Story 6's `ImportBatch`/`ImportStagedRow` (§3 assigns that table to Story 6, not Story 1 — this line previously said "Story 1's", a spec self-inconsistency caught and fixed during Story 1's final review); Story 9's category migration can run independently of import (Stories 4-7) but Story 7's "keep freeform category" decision exists specifically so Sprint 2 doesn't have to wait on Sprint 3's category design. Story 10 needs Story 2's void endpoint and Story 6's `ImportBatch` to both exist.

## 12. Out of scope (explicitly, not an oversight)

- Regex-based categorization patterns (substring only, per §8).
- Editing a `planned` or `adjustment` lifecycle row through Story 2's endpoints (no write path for `adjustment` exists yet anywhere in the codebase; `planned` editing is its own future scope, not blocked by this design but not built here).
- Any obligation-match or reconciliation content in the impact-preview response (Epic 17/20's job, additive later).
- Cross-currency transfers (RON-only remains the MVP boundary per `CLAUDE.md`).

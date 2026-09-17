# Epic 11 Story 4: CSV Import Backend (Revolut format) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `finance-api` the ability to import a Revolut personal-account CSV export into an existing account: a `POST /transactions/import/preview` endpoint that parses the file and reports what would happen (per-row valid/duplicate/error/skipped status) without writing anything, a `POST /transactions/import/commit` endpoint that atomically inserts the confirmed rows with dedupe protection, and a `GET /transactions/export` endpoint for the reverse direction (CSV download of the caller's own transactions).

**Architecture:** Two new pure, independently-testable modules (`revolut-parser.ts`, `import-hash.ts`) do all the CSV-format-specific work with zero DB/HTTP dependency — same "pure calculator" pattern already used for `web/lib/simulator.ts` and `analytics-service/forecast.py`. `TransactionsService` gains `previewImport`/`commitImport`/`exportCsv` methods that wrap those pure functions with the DB-facing concerns (ownership check, dedupe-against-DB check, atomic insert). `TransactionsController` gains three routes, all behind the existing `InternalAuthGuard`. No server-side import-session/batch table — the preview response is the full row set, and `commit`'s request body is that same row set (the subset the user kept checked), re-validated server-side. `Transaction.importHash` is a new nullable column with `@@unique([accountId, importHash])`; Postgres treats `NULL` as distinct from any other `NULL` in a unique index, so manually-entered transactions (which never set this column) never collide with each other.

**Tech Stack:** NestJS + Prisma (finance-api), `csv-parse` (new dependency, CSV parsing), `multer` (already a transitive dependency of `@nestjs/platform-express`, used here via `FileInterceptor`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-settings-csv-import-design.md`

## Global Constraints

- Money fields use Prisma `Decimal` / Postgres `NUMERIC(14,2)`, never a float or an integer-bani field at the DB layer (CLAUDE.md non-negotiable; matches `Transaction.amount` elsewhere).
- Dates are stored as `@db.Date` (no time/timezone component); use `fromDateOnlyString`/`toDateOnlyString` from `finance-api/src/common/serialization.ts` at the DB boundary, never a raw `new Date(...)`.
- Finance API request DTOs are camelCase, Zod-validated via `nestjs-zod` (`createZodDto`); response bodies are hand-built snake_case objects (established convention — see `AccountsService`/`TransactionsService`/`UsersService`). Do not "fix" this in this story.
- Every per-user Finance API route is guarded with `@UseGuards(InternalAuthGuard)` (already applied at the `TransactionsController` class level) and reads the caller's id via `@CurrentUserId()` — never a client-supplied user id. Every route that takes an `accountId` re-verifies it belongs to the caller before doing anything with it (same pattern as `TransactionsService.create`'s `ForbiddenException` check) — never trust a client-supplied `accountId` on its own.
- Never invent a bank transaction identifier (brief §11 rule 3). The `importHash` is an internal dedupe fingerprint computed from file-verbatim fields — it is never returned to the client as if it were a real Revolut transaction ID, and it is never derived from anything the file doesn't actually contain.
- A CSV row's `State` value gates whether it's ever considered for import at all: only `COMPLETED` rows produce an importable row. Everything else (`PENDING`, `REVERTED`, `DECLINED`, ...) is shown in the preview with `status: "skipped"` and a reason — never silently dropped, never imported.
- A malformed row (bad date, non-numeric amount) must produce a row with `status: "error"` and a `reason` string — parsing one bad line must never throw and abort the whole file's preview. A structurally broken CSV (wrong column count, unparseable syntax) is the one case allowed to reject the whole file with a 400 — there's no single row to blame.
- Existing tests hit a real Postgres dev database (`saldovio_dev`) with no mocking at the service layer (see `finance-api/src/transactions/transactions.service.spec.ts`, `finance-api/src/users/users.service.spec.ts`) — follow the same pattern, not an in-memory mock.
- `csv-parse` is pinned to an exact version (not a caret range) in `package.json` — same convention as this project's other financial-data-adjacent dependencies (`prisma`, `recharts`): a parser for real bank statement data has no business silently picking up a new major/minor at install time.
- Out of scope for this story (per the approved epic spec — do not build): the CSV import UI (Story 5), any bank export format other than Revolut, editing/undoing a committed import, modeling a Revolut `TRANSFER` row as Saldovio's own `transfer` transaction type.

---

### Task 1: Prisma schema — `Transaction.importHash`

**Files:**
- Modify: `finance-api/prisma/schema.prisma`
- Create: `finance-api/prisma/migrations/<timestamp>_add_transaction_import_hash/migration.sql` (generated by `prisma migrate dev`, not hand-written)

**Interfaces:**
- Produces: `Transaction.importHash: string | null` on the Prisma model, and a `@@unique([accountId, importHash])` constraint that later tasks (3, 4) rely on for dedupe.

- [ ] **Step 1: Add the new field to the Prisma schema**

Edit `finance-api/prisma/schema.prisma`, in the `Transaction` model:

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

  @@unique([accountId, importHash])
  @@map("transactions")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd finance-api && npx prisma migrate dev --name add_transaction_import_hash`

Expected: a new folder under `finance-api/prisma/migrations/` containing a `migration.sql` with an `ALTER TABLE "transactions" ADD COLUMN "import_hash" TEXT` and a `CREATE UNIQUE INDEX` on `(account_id, import_hash)`, applied cleanly against `saldovio_dev`, and the Prisma client regenerated (`finance-api/src/generated/prisma/models/Transaction.ts` now shows `importHash`).

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd finance-api && npx vitest run`
Expected: PASS — this is an additive, nullable column; nothing existing references it yet.

- [ ] **Step 4: Commit**

```bash
cd finance-api
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Transaction.importHash for CSV import dedupe (Epic 11 Story 4)"
```

---

### Task 2: `import-hash.ts` — dedupe fingerprint

**Files:**
- Create: `finance-api/src/transactions/csv/import-hash.ts`
- Create: `finance-api/src/transactions/csv/import-hash.spec.ts`

**Interfaces:**
- Produces: `computeImportHash(fields: { completedDate: string; description: string; amount: string; currency: string; balance: string; discriminator?: 'fee' }): string`.
- Consumes (Task 3): called once per main row and once per fee row by `revolut-parser.ts`.

- [ ] **Step 1: Write the failing test**

Create `finance-api/src/transactions/csv/import-hash.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeImportHash } from './import-hash.js';

const baseFields = {
  completedDate: '2026-09-10 14:32:00',
  description: 'Coffee Shop',
  amount: '-12.50',
  currency: 'RON',
  balance: '987.50',
};

describe('computeImportHash', () => {
  it('produces the same hash for the same fields', () => {
    expect(computeImportHash(baseFields)).toBe(computeImportHash({ ...baseFields }));
  });

  it('produces a different hash when any field differs', () => {
    const hash = computeImportHash(baseFields);
    expect(computeImportHash({ ...baseFields, amount: '-12.51' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, description: 'Coffee Shop 2' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, completedDate: '2026-09-11 14:32:00' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, currency: 'EUR' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, balance: '987.51' })).not.toBe(hash);
  });

  it('a fee-row hash never collides with its main row, even when amount equals the fee', () => {
    const mainHash = computeImportHash({ ...baseFields, amount: '1.00' });
    const feeHash = computeImportHash({ ...baseFields, amount: '1.00', discriminator: 'fee' });
    expect(feeHash).not.toBe(mainHash);
  });

  it('returns a 64-character lowercase hex string (sha256)', () => {
    expect(computeImportHash(baseFields)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd finance-api && npx vitest run src/transactions/csv/import-hash.spec.ts`
Expected: FAIL — `Cannot find module './import-hash.js'`.

- [ ] **Step 3: Implement**

Create `finance-api/src/transactions/csv/import-hash.ts`:

```ts
import { createHash } from 'node:crypto';

// Dedupe fingerprint per brief §11 rule 3 ("repeated import of the same
// file must be handled explicitly; never invent bank identifiers not
// present in the file"). All five inputs are taken verbatim from the CSV
// row's raw string values — not the normalized/derived amount or date —
// so re-importing the exact same file always reproduces the exact same
// hash. This is an internal dedupe fingerprint only, never presented to
// the user as or confused with a real Revolut transaction ID.
//
// `discriminator` is set to "fee" when hashing the fee half of a row that
// got split into two transactions (see revolut-parser.ts) — without it, a
// row whose Fee happens to equal its Amount would hash identically to its
// own main row and collide.
export function computeImportHash(fields: {
  completedDate: string;
  description: string;
  amount: string;
  currency: string;
  balance: string;
  discriminator?: 'fee';
}): string {
  const parts = [
    fields.completedDate,
    fields.description,
    fields.amount,
    fields.currency,
    fields.balance,
  ];
  if (fields.discriminator) {
    parts.push(fields.discriminator);
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd finance-api && npx vitest run src/transactions/csv/import-hash.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/transactions/csv/import-hash.ts src/transactions/csv/import-hash.spec.ts
git commit -m "feat: add computeImportHash dedupe fingerprint for CSV import"
```

---

### Task 3: `revolut-parser.ts` — pure Revolut CSV parser

**Files:**
- Create: `finance-api/src/transactions/csv/revolut-parser.ts`
- Create: `finance-api/src/transactions/csv/revolut-parser.spec.ts`
- Modify: `finance-api/package.json` (new dependency: `csv-parse`)

**Interfaces:**
- Consumes: `computeImportHash` from Task 2.
- Produces: `export type ParsedRowStatus = 'valid' | 'duplicate' | 'error' | 'skipped';`, `export type ParsedRow = { hash: string; status: ParsedRowStatus; description: string; occurredOn: string | null; type: 'income' | 'expense' | null; amount: string | null; category: string | null; reason: string | null }`, `export function parseRevolutCsv(input: Buffer | string): ParsedRow[]`. Task 4 (`previewImport`) calls this directly and may additionally flip a `'valid'` row to `'duplicate'` after checking the DB — `revolut-parser.ts` itself never touches the DB, so it can only ever return `'valid'`, `'error'`, or `'skipped'`, never `'duplicate'`.
- `parseRevolutCsv` throws a plain `Error` (not a NestJS exception — this module has no NestJS dependency) when the CSV is structurally unparseable (bad column count, broken quoting) or exceeds the row cap. Task 4 catches this and re-throws as `BadRequestException`.

- [ ] **Step 1: Install the new dependency**

Run: `cd finance-api && npm install csv-parse@7.0.2`

Expected: `finance-api/package.json`'s `dependencies` gains `"csv-parse": "7.0.2"` (exact, no `^`) and `finance-api/package-lock.json` updates.

- [ ] **Step 2: Write the failing tests**

Create `finance-api/src/transactions/csv/revolut-parser.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRevolutCsv } from './revolut-parser.js';

const HEADER = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseRevolutCsv', () => {
  it('parses a valid COMPLETED expense row', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'valid',
      description: 'Coffee Shop',
      occurredOn: '2026-09-10',
      type: 'expense',
      amount: '-12.50',
      category: 'CARD_PAYMENT',
      reason: null,
    });
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses a valid COMPLETED income row (positive amount)', () => {
    const rows = parseRevolutCsv(
      csv('TOPUP,Current,2026-09-11 09:00:00,2026-09-11 09:00:00,Top-up,100.00,0,RON,COMPLETED,1087.50'),
    );

    expect(rows[0]).toMatchObject({ status: 'valid', type: 'income', amount: '100.00' });
  });

  it('skips a non-COMPLETED row with a reason, instead of importing or erroring it', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,PENDING,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('skipped');
    expect(rows[0].reason).toContain('PENDING');
  });

  it('produces an error row (not a thrown exception) for an unparseable Completed Date', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,not-a-date,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].reason).toContain('Completed Date');
    expect(rows[0].occurredOn).toBeNull();
  });

  it('produces an error row for a non-numeric Amount', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,not-a-number,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].reason).toContain('Amount');
  });

  it('expands a row with a nonzero Fee into a main row plus a separate Fee row', () => {
    const rows = parseRevolutCsv(
      csv('EXCHANGE,Current,2026-09-12 08:00:00,2026-09-12 08:00:00,FX trade,-50.00,1.25,RON,COMPLETED,937.25'),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: 'valid', type: 'expense', amount: '-50.00', category: 'EXCHANGE' });
    expect(rows[1]).toMatchObject({ status: 'valid', type: 'expense', amount: '-1.25', category: 'Fee' });
    expect(rows[1].occurredOn).toBe(rows[0].occurredOn);
    expect(rows[1].hash).not.toBe(rows[0].hash);
  });

  it('does not add a Fee row when Fee is 0 or blank', () => {
    const zero = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );
    const blank = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,,RON,COMPLETED,987.50'),
    );

    expect(zero).toHaveLength(1);
    expect(blank).toHaveLength(1);
  });

  it('rejects a structurally broken CSV (inconsistent column count) by throwing', () => {
    expect(() => parseRevolutCsv('Type,Product\nonly,two,but,header,has,two')).toThrow();
  });

  it('rejects a file over the row cap by throwing', () => {
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Row ${i},-1.00,0,RON,COMPLETED,1.00`,
    );

    expect(() => parseRevolutCsv(csv(...rows))).toThrow(/row limit/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/csv/revolut-parser.spec.ts`
Expected: FAIL — `Cannot find module './revolut-parser.js'`.

- [ ] **Step 4: Implement**

Create `finance-api/src/transactions/csv/revolut-parser.ts`:

```ts
import { parse } from 'csv-parse/sync';
import { computeImportHash } from './import-hash.js';

export type ParsedRowStatus = 'valid' | 'duplicate' | 'error' | 'skipped';

export type ParsedRow = {
  hash: string;
  status: ParsedRowStatus;
  description: string;
  occurredOn: string | null;
  type: 'income' | 'expense' | null;
  amount: string | null;
  category: string | null;
  reason: string | null;
};

// Defensive ceiling, not a product constant — guards against a runaway
// upload (memory, request-timeout) rather than expressing any real
// business limit on statement size.
const MAX_DATA_ROWS = 5000;

type RawRevolutRow = {
  Type: string;
  Product: string;
  'Started Date': string;
  'Completed Date': string;
  Description: string;
  Amount: string;
  Fee: string;
  Currency: string;
  State: string;
  Balance: string;
};

export function parseRevolutCsv(input: Buffer | string): ParsedRow[] {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawRevolutRow[];

  if (records.length > MAX_DATA_ROWS) {
    throw new Error(`CSV has ${records.length} rows, exceeding the ${MAX_DATA_ROWS}-row limit`);
  }

  return records.flatMap(parseRecord);
}

function parseRecord(record: RawRevolutRow): ParsedRow[] {
  const description = record.Description ?? '';
  const hashFields = (amount: string, discriminator?: 'fee') => ({
    completedDate: record['Completed Date'],
    description,
    amount,
    currency: record.Currency,
    balance: record.Balance,
    discriminator,
  });

  // Only a COMPLETED row is ever a candidate for import — everything
  // else is reported, never silently dropped and never imported.
  if (record.State !== 'COMPLETED') {
    return [
      {
        hash: computeImportHash(hashFields(record.Amount)),
        status: 'skipped',
        description,
        occurredOn: null,
        type: null,
        amount: null,
        category: null,
        reason: `State is "${record.State}", not COMPLETED`,
      },
    ];
  }

  const occurredOn = parseCompletedDate(record['Completed Date']);
  const amount = parseDecimalField(record.Amount);

  if (occurredOn === null || amount === null) {
    const reasons: string[] = [];
    if (occurredOn === null) reasons.push(`unparseable Completed Date "${record['Completed Date']}"`);
    if (amount === null) reasons.push(`unparseable Amount "${record.Amount}"`);
    return [
      {
        hash: computeImportHash(hashFields(record.Amount)),
        status: 'error',
        description,
        occurredOn: null,
        type: null,
        amount: null,
        category: null,
        reason: reasons.join('; '),
      },
    ];
  }

  const mainRow: ParsedRow = {
    hash: computeImportHash(hashFields(record.Amount)),
    status: 'valid',
    description,
    occurredOn,
    type: amount.startsWith('-') ? 'expense' : 'income',
    amount,
    category: record.Type,
    reason: null,
  };

  const rows: ParsedRow[] = [mainRow];

  // A nonzero Fee is a real cost distinct from the row's own Amount
  // (e.g. a currency-exchange or ATM fee) — imported as its own expense
  // row, same date, category "Fee", with its own independent dedupe
  // hash (see the "discriminator" comment on computeImportHash).
  const fee = parseDecimalField(record.Fee);
  if (fee !== null && fee !== '0') {
    rows.push({
      hash: computeImportHash(hashFields(record.Fee, 'fee')),
      status: 'valid',
      description,
      occurredOn,
      type: 'expense',
      amount: fee.startsWith('-') ? fee : `-${fee}`,
      category: 'Fee',
      reason: null,
    });
  }

  return rows;
}

// "2026-09-10 14:32:00" -> "2026-09-10", or null if the string doesn't
// match the expected shape or names a calendar date that doesn't exist.
function parseCompletedDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}:\d{2}/.exec(value.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth) return null;
  return `${yearStr}-${monthStr}-${dayStr}`;
}

// Returns the trimmed decimal string unchanged (so the dedupe hash can
// still use the file-verbatim value upstream), or null if it isn't a
// plain optionally-negative decimal. An empty/blank field (common for
// Fee) returns null, read by the caller as "no fee".
function parseDecimalField(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/csv/revolut-parser.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
cd finance-api
git add package.json package-lock.json src/transactions/csv/revolut-parser.ts src/transactions/csv/revolut-parser.spec.ts
git commit -m "feat: add parseRevolutCsv — pure Revolut statement parser"
```

---

### Task 4: `TransactionsService.previewImport`

**Files:**
- Modify: `finance-api/src/transactions/transactions.service.ts`
- Modify: `finance-api/src/transactions/transactions.service.spec.ts`

**Interfaces:**
- Consumes: `parseRevolutCsv` (Task 3), `ForbiddenException` (already imported in this file).
- Produces: `TransactionsService.previewImport(accountId: number, file: Buffer, userId: number): Promise<{ rows: PreviewRowResponse[] }>`, where `PreviewRowResponse = { hash: string; status: ParsedRowStatus; description: string; occurred_on: string | null; type: 'income' | 'expense' | null; amount: string | null; category: string | null; reason: string | null }`. Task 6 (controller) calls this directly and returns its result as the HTTP response body.
- `previewImport` writes nothing to the database — it only reads (ownership check, existing-hash check).

- [ ] **Step 1: Write the failing tests**

Add to `finance-api/src/transactions/transactions.service.spec.ts`, inside the existing `describe('TransactionsService', ...)` block (after the existing tests, before the closing `});`). First add the import at the top of the file:

```ts
import { BadRequestException } from '@nestjs/common';
```

Then the tests:

```ts
  const REVOLUT_HEADER =
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

  function revolutCsv(...rows: string[]): Buffer {
    return Buffer.from([REVOLUT_HEADER, ...rows].join('\n'));
  }

  it('previewImport parses a valid CSV and reports it as valid with no duplicates', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    const result = await service.previewImport(accountId, csv, userId);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      status: 'valid',
      occurred_on: '2026-09-10',
      type: 'expense',
      amount: '-12.50',
      category: 'CARD_PAYMENT',
    });
  });

  it('previewImport flags a row as duplicate when its hash already exists for the account', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );
    const first = await service.previewImport(accountId, csv, userId);
    await service.commitImport(
      accountId,
      first.rows.map((r) => ({
        hash: r.hash,
        occurredOn: r.occurred_on!,
        type: r.type!,
        amount: Number(r.amount),
        category: r.category!,
      })),
      userId,
    );

    const second = await service.previewImport(accountId, csv, userId);

    expect(second.rows[0].status).toBe('duplicate');
  });

  it('previewImport does not flag a row as duplicate on the very first import', async () => {
    const csv = revolutCsv(
      'TOPUP,Current,2026-09-11 09:00:00,2026-09-11 09:00:00,Top-up,100.00,0,RON,COMPLETED,1087.50',
    );

    const result = await service.previewImport(accountId, csv, userId);

    expect(result.rows[0].status).toBe('valid');
  });

  it('previewImport rejects uploading against an account that does not belong to the caller', async () => {
    await expect(
      service.previewImport(otherUserAccountId, revolutCsv(), userId),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('previewImport surfaces an unparseable CSV as a BadRequestException', async () => {
    await expect(
      service.previewImport(accountId, Buffer.from('not,a,valid\nheader,has,fewer,columns,than,rows'), userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previewImport writes nothing to the database', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    await service.previewImport(accountId, csv, userId);

    const stored = await prisma.transaction.findMany({ where: { accountId } });
    expect(stored).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: FAIL — `service.previewImport is not a function`. (`commitImport`, referenced by the second test, is Task 5's job — that test stays red until Task 5 lands too; run it again after Task 5.)

- [ ] **Step 3: Implement**

Edit `finance-api/src/transactions/transactions.service.ts` — add imports and the new method:

```ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { parseRevolutCsv, type ParsedRow } from './csv/revolut-parser.js';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto, userId: number) {
    // ...unchanged, see existing implementation...
  }

  async findAll(userId: number) {
    // ...unchanged, see existing implementation...
  }

  async previewImport(accountId: number, file: Buffer, userId: number) {
    await this.assertOwnsAccount(accountId, userId);

    let rows: ParsedRow[];
    try {
      rows = parseRevolutCsv(file);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not parse CSV file',
      );
    }

    const candidateHashes = rows.filter((r) => r.status === 'valid').map((r) => r.hash);
    const existingHashes = new Set(
      candidateHashes.length
        ? (
            await this.prisma.transaction.findMany({
              where: { accountId, importHash: { in: candidateHashes } },
              select: { importHash: true },
            })
          ).map((t) => t.importHash)
        : [],
    );

    // A hash appearing twice within the same file (identical row
    // repeated, or an unlikely accidental collision) must not be
    // allowed to reach commitImport twice — the second occurrence is
    // flagged here rather than relying on commitImport to catch it,
    // so the preview the user sees already reflects what commit will
    // actually do.
    const seenInFile = new Set<string>();

    return {
      rows: rows.map((row) => {
        if (row.status !== 'valid') {
          return this.serializePreviewRow(row);
        }
        if (existingHashes.has(row.hash)) {
          return this.serializePreviewRow({ ...row, status: 'duplicate', reason: 'Already imported' });
        }
        if (seenInFile.has(row.hash)) {
          return this.serializePreviewRow({
            ...row,
            status: 'duplicate',
            reason: 'Duplicate row within this file',
          });
        }
        seenInFile.add(row.hash);
        return this.serializePreviewRow(row);
      }),
    };
  }

  private async assertOwnsAccount(accountId: number, userId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }
  }

  private serializePreviewRow(row: ParsedRow) {
    return {
      hash: row.hash,
      status: row.status,
      description: row.description,
      occurred_on: row.occurredOn,
      type: row.type,
      amount: row.amount,
      category: row.category,
      reason: row.reason,
    };
  }
}
```

Note: `create()`'s existing inline ownership check (the `findFirst`/`ForbiddenException` block already in this file) can stay as-is — refactoring it to call the new `assertOwnsAccount` helper is optional cleanup, not required by this task. If you do refactor it, re-run the full test file afterward to confirm no behavior changed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: 3 of the 6 new tests PASS; the duplicate-detection test and any test calling `commitImport` still FAIL (`commitImport is not a function`) until Task 5. Confirm the failure is specifically that, not something else.

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/transactions/transactions.service.ts src/transactions/transactions.service.spec.ts
git commit -m "feat: add TransactionsService.previewImport"
```

---

### Task 5: `TransactionsService.commitImport`

**Files:**
- Modify: `finance-api/src/transactions/transactions.service.ts`
- Modify: `finance-api/src/transactions/transactions.service.spec.ts`

**Interfaces:**
- Consumes: `assertOwnsAccount` (Task 4, private helper — same file).
- Produces: `TransactionsService.commitImport(accountId: number, rows: ImportRowInput[], userId: number): Promise<{ imported: number; skippedDuplicates: number }>`, where `ImportRowInput = { hash: string; occurredOn: string; type: 'income' | 'expense'; amount: number; category: string }`. Task 6 (controller) calls this with `dto.rows` from the Zod-validated commit DTO.

- [ ] **Step 1: Write the failing tests**

Add to `finance-api/src/transactions/transactions.service.spec.ts` (this also completes the two tests from Task 4 that were waiting on `commitImport` to exist — re-run the full file after this task, not just the new tests below):

```ts
  it('commitImport inserts the given rows and stamps each with its hash', async () => {
    const result = await service.commitImport(
      accountId,
      [{ hash: 'hash-a', occurredOn: '2026-09-10', type: 'expense', amount: -12.5, category: 'Coffee' }],
      userId,
    );

    expect(result).toEqual({ imported: 1, skippedDuplicates: 0 });
    const stored = await prisma.transaction.findMany({ where: { accountId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].importHash).toBe('hash-a');
    expect(stored[0].amount.toString()).toBe('-12.5');
  });

  it('commitImport skips a row whose hash already exists for the account, without failing the batch', async () => {
    await prisma.transaction.create({
      data: {
        accountId,
        type: 'expense',
        amount: new Prisma.Decimal(-5),
        occurredOn: new Date('2026-09-01T00:00:00.000Z'),
        category: 'Old',
        importHash: 'existing-hash',
      },
    });

    const result = await service.commitImport(
      accountId,
      [
        { hash: 'existing-hash', occurredOn: '2026-09-10', type: 'expense', amount: -5, category: 'Old' },
        { hash: 'new-hash', occurredOn: '2026-09-10', type: 'income', amount: 100, category: 'New' },
      ],
      userId,
    );

    expect(result).toEqual({ imported: 1, skippedDuplicates: 1 });
    const stored = await prisma.transaction.findMany({
      where: { accountId, importHash: { in: ['existing-hash', 'new-hash'] } },
    });
    expect(stored).toHaveLength(2);
  });

  it('commitImport inserts a hash only once even if it appears twice in the same request', async () => {
    const result = await service.commitImport(
      accountId,
      [
        { hash: 'repeat-hash', occurredOn: '2026-09-10', type: 'income', amount: 10, category: 'A' },
        { hash: 'repeat-hash', occurredOn: '2026-09-10', type: 'income', amount: 10, category: 'A' },
      ],
      userId,
    );

    expect(result).toEqual({ imported: 1, skippedDuplicates: 1 });
    const stored = await prisma.transaction.findMany({ where: { accountId, importHash: 'repeat-hash' } });
    expect(stored).toHaveLength(1);
  });

  it('commitImport rejects committing into an account that does not belong to the caller', async () => {
    await expect(
      service.commitImport(
        otherUserAccountId,
        [{ hash: 'x', occurredOn: '2026-09-10', type: 'income', amount: 1, category: 'X' }],
        userId,
      ),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('a batch commit rolls back entirely if a later insert in the same transaction fails', async () => {
    // Proves Prisma's $transaction actually rolls back a batch of
    // individual transaction.create calls for this model — not just
    // that commitImport is structurally wrapped in one. Same pattern
    // as the atomic-signup rollback test in users.service.spec.ts.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            accountId,
            type: 'income',
            amount: new Prisma.Decimal(10),
            occurredOn: new Date('2026-09-10T00:00:00.000Z'),
            category: 'Test',
            importHash: 'rollback-hash-1',
          },
        });
        // Force a real Postgres FK violation on the second write.
        await tx.transaction.create({
          data: {
            accountId: -1,
            type: 'income',
            amount: new Prisma.Decimal(20),
            occurredOn: new Date('2026-09-10T00:00:00.000Z'),
            category: 'Test',
            importHash: 'rollback-hash-2',
          },
        });
      }),
    ).rejects.toThrow();

    const rolledBack = await prisma.transaction.findFirst({ where: { importHash: 'rollback-hash-1' } });
    expect(rolledBack).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: the new tests calling `service.commitImport(...)` FAIL with `service.commitImport is not a function`. The last test (raw `prisma.$transaction` rollback) doesn't depend on `commitImport` existing — it should already PASS at this point; if it doesn't, stop and investigate before continuing (it would mean something about the schema/FK setup is wrong, not that a feature is missing).

- [ ] **Step 3: Implement**

Edit `finance-api/src/transactions/transactions.service.ts` — add the import type and method:

```ts
export type ImportRowInput = {
  hash: string;
  occurredOn: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
};
```

(Add this type export near the top of the file, after the existing imports.)

```ts
  async commitImport(accountId: number, rows: ImportRowInput[], userId: number) {
    await this.assertOwnsAccount(accountId, userId);

    return this.prisma.$transaction(async (tx) => {
      const requestedHashes = rows.map((r) => r.hash);
      const existing = await tx.transaction.findMany({
        where: { accountId, importHash: { in: requestedHashes } },
        select: { importHash: true },
      });
      const existingHashes = new Set(existing.map((t) => t.importHash));

      const seen = new Set<string>();
      let imported = 0;

      for (const row of rows) {
        if (existingHashes.has(row.hash) || seen.has(row.hash)) {
          continue;
        }
        seen.add(row.hash);
        await tx.transaction.create({
          data: {
            accountId,
            type: row.type,
            amount: new Prisma.Decimal(row.amount),
            occurredOn: fromDateOnlyString(row.occurredOn),
            category: row.category,
            importHash: row.hash,
          },
        });
        imported += 1;
      }

      return { imported, skippedDuplicates: rows.length - imported };
    });
  }
```

Add this method to the `TransactionsService` class, after `previewImport`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: PASS — the full file, including the two Task-4 tests that were waiting on this method.

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/transactions/transactions.service.ts src/transactions/transactions.service.spec.ts
git commit -m "feat: add TransactionsService.commitImport with atomic dedupe-checked insert"
```

---

### Task 6: DTOs + controller wiring (`import/preview`, `import/commit`)

**Files:**
- Create: `finance-api/src/transactions/dto/import-preview.dto.ts`
- Create: `finance-api/src/transactions/dto/import-preview.dto.spec.ts`
- Create: `finance-api/src/transactions/dto/import-commit.dto.ts`
- Create: `finance-api/src/transactions/dto/import-commit.dto.spec.ts`
- Modify: `finance-api/src/transactions/transactions.controller.ts`
- Modify: `finance-api/tsconfig.json`
- Modify: `finance-api/package.json` (new devDependency: `@types/multer`)

**Interfaces:**
- Consumes: `TransactionsService.previewImport`/`commitImport` (Tasks 4, 5).
- Produces: `POST /transactions/import/preview` (multipart: `file` + `accountId` field), `POST /transactions/import/commit` (JSON: `{ accountId, rows }`) — both behind the existing class-level `@UseGuards(InternalAuthGuard)`.

- [ ] **Step 1: Install `@types/multer`**

Run: `cd finance-api && npm install --save-dev @types/multer@2.2.0`

- [ ] **Step 2: Register `multer`'s ambient types**

This project's `tsconfig.json` restricts automatic type inclusion to `["vitest/globals", "node"]` (see the existing file) — installing `@types/multer` alone won't make `Express.Multer.File` resolve, since it's never explicitly imported by name. Edit `finance-api/tsconfig.json`:

```json
    "types": ["vitest/globals", "node", "multer"]
```

(Replace the existing `"types": ["vitest/globals", "node"]` line with the one above.)

- [ ] **Step 3: Write the failing DTO tests**

Create `finance-api/src/transactions/dto/import-preview.dto.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ImportPreviewSchema } from './import-preview.dto.js';

describe('ImportPreviewSchema', () => {
  it('coerces a string accountId (as sent by a multipart form field) to a number', () => {
    const result = ImportPreviewSchema.safeParse({ accountId: '5' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.accountId).toBe(5);
  });

  it('rejects a non-numeric accountId', () => {
    expect(ImportPreviewSchema.safeParse({ accountId: 'not-a-number' }).success).toBe(false);
  });

  it('rejects a missing accountId', () => {
    expect(ImportPreviewSchema.safeParse({}).success).toBe(false);
  });
});
```

Create `finance-api/src/transactions/dto/import-commit.dto.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ImportCommitSchema } from './import-commit.dto.js';

const validRow = {
  hash: 'a'.repeat(64),
  occurredOn: '2026-09-10',
  type: 'expense' as const,
  amount: -12.5,
  category: 'Coffee',
};

describe('ImportCommitSchema', () => {
  it('accepts a valid payload with one row', () => {
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [validRow] }).success).toBe(true);
  });

  it('rejects an empty rows array', () => {
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [] }).success).toBe(false);
  });

  it('rejects a row with a malformed occurredOn', () => {
    const invalid = { ...validRow, occurredOn: '10-09-2026' };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });

  it('rejects a row with a type outside income/expense', () => {
    const invalid = { ...validRow, type: 'transfer' };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/dto/import-preview.dto.spec.ts src/transactions/dto/import-commit.dto.spec.ts`
Expected: FAIL — both modules don't exist yet.

- [ ] **Step 5: Implement the DTOs**

Create `finance-api/src/transactions/dto/import-preview.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// accountId arrives as a plain string here, not a JSON number — this
// DTO validates the non-file fields of a multipart/form-data request
// (multer puts them in req.body as strings), unlike every other DTO in
// this codebase which validates an already-JSON-parsed body.
export const ImportPreviewSchema = z.object({
  accountId: z.coerce.number().int(),
});

export class ImportPreviewDto extends createZodDto(ImportPreviewSchema) {}
```

Create `finance-api/src/transactions/dto/import-commit.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ImportRowSchema = z.object({
  hash: z.string().min(1),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be in YYYY-MM-DD format'),
  type: z.enum(['income', 'expense']),
  amount: z.number(),
  category: z.string(),
});

export const ImportCommitSchema = z.object({
  accountId: z.number().int(),
  rows: z.array(ImportRowSchema).min(1),
});

export class ImportCommitDto extends createZodDto(ImportCommitSchema) {}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/dto/import-preview.dto.spec.ts src/transactions/dto/import-commit.dto.spec.ts`
Expected: PASS (3 + 4 tests).

- [ ] **Step 7: Wire the controller**

Edit `finance-api/src/transactions/transactions.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ImportPreviewDto } from './dto/import-preview.dto.js';
import { ImportCommitDto } from './dto/import-commit.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

// Generous for a personal-account statement export; the real ceiling
// against a runaway file is revolut-parser.ts's 5000-data-row cap,
// this is just a defensive limit on raw upload size.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@UseGuards(InternalAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUserId() userId: number) {
    return this.transactionsService.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUserId() userId: number) {
    return this.transactionsService.findAll(userId);
  }

  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  previewImport(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportPreviewDto,
    @CurrentUserId() userId: number,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.transactionsService.previewImport(dto.accountId, file.buffer, userId);
  }

  @Post('import/commit')
  commitImport(@Body() dto: ImportCommitDto, @CurrentUserId() userId: number) {
    return this.transactionsService.commitImport(dto.accountId, dto.rows, userId);
  }
}
```

(`GET /transactions/export` is added in Task 7, in the same file — not included here to keep this task's diff scoped to import.)

- [ ] **Step 8: Run the full finance-api test suite**

Run: `cd finance-api && npx vitest run`
Expected: PASS — this step adds no new automated tests (multipart controller behavior is verified manually next, matching this project's standing convention of curl-verifying guard/multipart behavior rather than building e2e supertest coverage — see `finance-api/test/app.e2e-spec.ts`, which has never been extended by any prior story).

- [ ] **Step 9: Manually verify the endpoints against a running server**

Start the server: `cd finance-api && npm run start:dev`

In another terminal, mint a token the same way prior stories' manual verification did (adjust to however `web/`'s current internal-auth minting works, or reuse a token captured from a real logged-in `web/` session's server logs/debugger — this project has no CLI script for minting one standalone).

```bash
# No token — expect 401
curl -i -X POST http://localhost:3000/transactions/import/preview \
  -F "accountId=1" -F "file=@/tmp/test-revolut.csv"

# Create /tmp/test-revolut.csv first:
cat > /tmp/test-revolut.csv <<'EOF'
Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50
EOF

# With a valid token for the real account owner — expect 200 with rows: [{status: "valid", ...}]
curl -i -X POST http://localhost:3000/transactions/import/preview \
  -H "Authorization: Bearer <token>" \
  -F "accountId=<real accountId>" -F "file=@/tmp/test-revolut.csv"

# With a valid token but someone else's accountId — expect 403
curl -i -X POST http://localhost:3000/transactions/import/preview \
  -H "Authorization: Bearer <token>" \
  -F "accountId=<an account belonging to a different user>" -F "file=@/tmp/test-revolut.csv"

# Commit — expect 200 with {"imported":1,"skippedDuplicates":0}, then re-run preview
# against the same file and confirm the row now shows status "duplicate"
curl -i -X POST http://localhost:3000/transactions/import/commit \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"accountId": <real accountId>, "rows": [{"hash":"<hash from the preview response above>","occurredOn":"2026-09-10","type":"expense","amount":-12.5,"category":"CARD_PAYMENT"}]}'
```

Confirm each response's status code and body shape matches the expectation in the comment above it before moving on.

- [ ] **Step 10: Commit**

```bash
cd finance-api
git add package.json package-lock.json tsconfig.json src/transactions/dto/import-preview.dto.ts src/transactions/dto/import-preview.dto.spec.ts src/transactions/dto/import-commit.dto.ts src/transactions/dto/import-commit.dto.spec.ts src/transactions/transactions.controller.ts
git commit -m "feat: wire POST /transactions/import/preview and /commit"
```

---

### Task 7: `GET /transactions/export`

**Files:**
- Create: `finance-api/src/transactions/csv/csv-escape.ts`
- Create: `finance-api/src/transactions/csv/csv-escape.spec.ts`
- Modify: `finance-api/src/transactions/transactions.service.ts`
- Modify: `finance-api/src/transactions/transactions.service.spec.ts`
- Modify: `finance-api/src/transactions/transactions.controller.ts`

**Interfaces:**
- Produces: `csvEscape(value: string): string` (pure), `TransactionsService.exportCsv(userId: number): Promise<string>` (the full CSV text, header included), `GET /transactions/export` (returns `text/csv`, `Content-Disposition: attachment`).

- [ ] **Step 1: Write the failing `csvEscape` test**

Create `finance-api/src/transactions/csv/csv-escape.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { csvEscape } from './csv-escape.js';

describe('csvEscape', () => {
  it('returns a plain value unchanged', () => {
    expect(csvEscape('Groceries')).toBe('Groceries');
  });

  it('quotes and escapes a value containing a comma', () => {
    expect(csvEscape('Rent, September')).toBe('"Rent, September"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves an empty string unchanged', () => {
    expect(csvEscape('')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd finance-api && npx vitest run src/transactions/csv/csv-escape.spec.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `csvEscape`**

Create `finance-api/src/transactions/csv/csv-escape.ts`:

```ts
// RFC 4180-style escaping: a field containing a comma, quote, or
// newline gets wrapped in double quotes, with any embedded double
// quote itself doubled. Used by exportCsv for the `category` and
// account-name fields, since a user-entered category is freeform text
// that can legally contain a comma.
export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd finance-api && npx vitest run src/transactions/csv/csv-escape.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing `exportCsv` service tests**

Add to `finance-api/src/transactions/transactions.service.spec.ts`:

```ts
  it('exportCsv returns a header row plus one line per transaction across all the caller\'s accounts', async () => {
    await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10', category: 'Salary' }, userId);
    await service.create({ accountId, type: 'expense', amount: -12.5, occurredOn: '2026-09-11', category: 'Coffee' }, userId);

    const csv = await service.exportCsv(userId);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('date,account,type,amount,category');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-09-10,Test,income,100,Salary');
    expect(lines[2]).toBe('2026-09-11,Test,expense,-12.5,Coffee');
  });

  it('exportCsv only includes the caller\'s own transactions', async () => {
    await service.create({ accountId, type: 'income', amount: 50, occurredOn: '2026-09-10' }, userId);

    const csv = await service.exportCsv(userId);

    expect(csv).not.toContain('otherUserAccountId');
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('exportCsv returns just the header when the caller has no transactions', async () => {
    const csv = await service.exportCsv(userId);
    expect(csv).toBe('date,account,type,amount,category');
  });

  it('exportCsv escapes a category containing a comma', async () => {
    await service.create({ accountId, type: 'expense', amount: -1, occurredOn: '2026-09-10', category: 'Rent, September' }, userId);

    const csv = await service.exportCsv(userId);

    expect(csv.split('\n')[1]).toBe('2026-09-10,Test,expense,-1,"Rent, September"');
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: the 4 new tests FAIL with `service.exportCsv is not a function`.

- [ ] **Step 7: Implement `exportCsv`**

Edit `finance-api/src/transactions/transactions.service.ts` — add the import and method:

```ts
import { csvEscape } from './csv/csv-escape.js';
```

```ts
  async exportCsv(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { account: { userId } },
      include: { account: { select: { name: true } } },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    const header = 'date,account,type,amount,category';
    const lines = transactions.map((t) =>
      [
        toDateOnlyString(t.occurredOn),
        csvEscape(t.account.name),
        t.type,
        toDecimalString(t.amount),
        csvEscape(t.category ?? ''),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }
```

Add this method to `TransactionsService`, after `commitImport`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd finance-api && npx vitest run src/transactions/transactions.service.spec.ts`
Expected: PASS — full file.

- [ ] **Step 9: Wire the controller route**

Edit `finance-api/src/transactions/transactions.controller.ts` — add the route (after `commitImport`):

```ts
  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="transactions.csv"')
  exportCsv(@CurrentUserId() userId: number) {
    return this.transactionsService.exportCsv(userId);
  }
```

(`Header` and `Get` are already imported from Task 6's edit to this file.)

- [ ] **Step 10: Run the full finance-api test suite**

Run: `cd finance-api && npx vitest run`
Expected: PASS.

- [ ] **Step 11: Manually verify against a running server**

With the dev server running (`npm run start:dev`) and a valid token:

```bash
curl -i http://localhost:3000/transactions/export -H "Authorization: Bearer <token>"
```

Confirm: `200`, `Content-Type: text/csv`, `Content-Disposition: attachment; filename="transactions.csv"`, and a body that is the raw CSV text (not JSON-stringified/quoted as a whole) — starting with `date,account,type,amount,category`.

```bash
curl -i http://localhost:3000/transactions/export
```

Confirm: `401` (no token).

- [ ] **Step 12: Commit**

```bash
cd finance-api
git add src/transactions/csv/csv-escape.ts src/transactions/csv/csv-escape.spec.ts src/transactions/transactions.service.ts src/transactions/transactions.service.spec.ts src/transactions/transactions.controller.ts
git commit -m "feat: add GET /transactions/export"
```

---

## Final verification (whole-branch, before requesting review)

- [ ] `cd finance-api && npx vitest run` — full suite passes.
- [ ] `cd finance-api && npx tsc --noEmit` — clean (this is the step that will surface any remaining `Express.Multer.File`/tsconfig `types` issue from Task 6 if Step 2 there didn't fully resolve it).
- [ ] `cd finance-api && npx oxlint src/` — clean.
- [ ] Re-read `docs/superpowers/specs/2026-09-15-settings-csv-import-design.md`'s CSV-import bullets and confirm every one is actually implemented: Revolut column format ✓, `State=COMPLETED`-only ✓, `Type` stored verbatim as `category` ✓, `Amount` sign maps directly (no `transfer` modeling) ✓, dedupe hash from file-verbatim fields ✓, schema (`Transaction.importHash` + `@@unique([accountId, importHash])`) ✓, the three endpoints ✓.

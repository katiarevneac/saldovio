# Validation of `improvements.md` (2026-09-23)

`improvements.md` is an external review of Saldovio: 18 findings (F01–F18), a
15-phase roadmap (S00–S15), and 32 debug scenarios (D01–D32). This document
is the evidence pass required before acting on it — per the review's own
stated standard ("do not report either as proof of a financial logic
defect"), an assertion about behavior is not accepted here without a test or
a cited file:line that demonstrates it.

Baseline: `main` at `c12f5f3` (2026-09-23), before this branch's changes.

Two phases:

- **V1** — every finding checked against the code. P0 findings get a failing
  reproduction test (captured below with its actual output); P1 findings get
  cited evidence.
- **V2** — the S00–S15 roadmap revised against V1's results.

## Summary

| ID | Priority | Verdict | Repro test |
|---|---|---|---|
| F01 | P0 | **TRUE** | `finance-api/src/accounts/accounts.service.spec.ts` — `F01: same-day income on a fresh zero-balance account is reflected in balance` |
| F02 | P0 | **TRUE** | `finance-api/src/accounts/accounts.service.spec.ts` — `F02: a transaction dated far in the future inflates the current balance` |
| F03 | P0 | **TRUE** | `analytics-service/test_forecast.py` — `test_f03_rule_already_paid_today_is_still_subtracted_again` |
| F04 | P0 | **TRUE** | `finance-api/src/transactions/csv/revolut-parser.spec.ts` — `F04: a COMPLETED row in a non-RON currency is accepted as if it were RON` |
| F05 | P0 | **TRUE** | `finance-api/src/transactions/csv/revolut-parser.spec.ts` — `F05: a positive-amount internal transfer/top-up is classified as plain income` |
| F06 | P1 | **TRUE** | inspection only — see below |
| F07 | P1 | **TRUE** | inspection only — see below |
| F08 | P0 | **TRUE** | `web/lib/simulator.spec.ts` + `web/components/SimulatorPanel.spec.tsx`, 2 tests |
| F09 | P1 | **TRUE, but deliberate** | inspection only — see conflict note below |
| F10 | P0 | **TRUE** | `finance-api/src/transactions/dto/create-transaction.dto.spec.ts`, 2 tests |
| F11 | P0 | **TRUE ×4** | `internal-auth.guard.spec.ts` (2 tests) + `test/improvements-findings.e2e-spec.ts` (2 tests) |
| F12 | P1 | **TRUE** | inspection only — see below |
| F13 | P1 | **TRUE** | inspection only — see below |
| F14 | P1 | **TRUE, worse than stated** | inspection only — see below |
| F15 | P1 | **PARTLY FALSE** | inspection only — CI half is false at HEAD, see below |
| F16 | P0 | **TRUE (BOM), FALSE (charset)** | `csv-escape.spec.ts`, `transactions.service.spec.ts`, `improvements-findings.e2e-spec.ts` — 3 tests, 1 is a correction |
| F17 | P0 | **PARTLY FALSE, now fixed by V0** | dev-DB half was true, fixed in this branch's V0 commit; user-count-test half already false at HEAD |
| F18 | P0 | **TRUE** | `import-commit.dto.spec.ts` + `improvements-findings.e2e-spec.ts`, 2 tests |

**16 of 18 findings are TRUE.** Two need correction before being used as a
baseline: **F15**'s CI claim and **F17**'s user-count-test claim were both
written against a pre-HEAD snapshot and are false at `c12f5f3`. **F16**'s
charset sub-claim is also false — Express adds `charset=utf-8`
automatically for `text/csv`; only its BOM sub-claim holds.

---

## V0 — test isolation (prerequisite, done this branch)

`npm test` in `finance-api` resolved `DATABASE_URL` through `PrismaService`'s
own `dotenv/config`, which loads `.env` and points at `saldovio_dev` — the
same database used for manual testing. Every P0 repro test below writes
rows, so this had to be fixed first.

Added `finance-api/test/setup-db-guard.ts` (a `vitest` `setupFiles` entry)
that loads `.env.test` and throws unless the resolved database name ends in
`_test`. Created a local `saldovio_test` database, applied the 4 existing
migrations to it.

Verified:
- `npm test` against `saldovio_test`: **109/109 pass** (unchanged from
  before this branch).
- `npm test` with `DATABASE_URL` pointed at `saldovio_dev`: **refused**,
  guard throws `Refusing to run tests against database "saldovio_dev"`.
- `npm test` with no `.env.test` file and `DATABASE_URL` pre-set to
  `saldovio_test` (the exact shape of CI's job-level env in
  `.github/workflows/ci.yml`): **109/109 pass**, guard does not interfere.

This closes F17's dev-DB sub-claim, going forward.

---

## V1 — P0 reproduction tests

Each test asserts the *correct* behavior and is expected to fail today. All
were run and their actual output captured below.

### F01 — default account excludes same-day income

```
finance-api/src/accounts/accounts.service.spec.ts
  F01: same-day income on a fresh zero-balance account is reflected in balance

AssertionError: expected '0' to be '1000'
Expected: "1000"
Received: "0"
```

`users.service.ts:36-43` creates the signup account with
`currentBalance: 0` and `referenceDate: todayDateOnly()`.
`accounts.service.ts:53`'s balance formula only adds transactions with
`occurred_on > reference_date`. A transaction recorded on signup day
satisfies neither term.

### F02 — no upper bound on transaction date

```
finance-api/src/accounts/accounts.service.spec.ts
  F02: a transaction dated far in the future inflates the current balance

AssertionError: expected '5100' to be '100'
Expected: "100"
Received: "5100"
```

`accounts.service.ts:46-60` — the only date predicate is
`t.occurred_on > a.reference_date`. Nothing bounds it against today.

### F03 — recurring rule and its settled transaction both subtract

```
analytics-service/test_forecast.py
  test_f03_rule_already_paid_today_is_still_subtracted_again

AssertionError: assert Decimal('600.00') == Decimal('800.00')
```

`Transaction` and `RecurringRule` have no link in
`finance-api/prisma/schema.prisma`. `ForecastRequest` (`forecast.py:38-42`)
has no transaction/occurrence-status input at all, so a rule due today is
always subtracted (`forecast.py:88-90`, window includes `calculation_date`)
even when `current_balance` (computed upstream from real transactions)
already reflects that same payment.

### F04 — CSV currency not checked against RON

```
finance-api/src/transactions/csv/revolut-parser.spec.ts
  F04: a COMPLETED row in a non-RON currency is accepted as if it were RON

AssertionError: expected 'valid' not to be 'valid'
```

`revolut-parser.ts:55` reads `Currency` only as a hash ingredient. No
comparison to RON exists anywhere in the import path; `Transaction` has no
currency column.

### F05 — import classifies purely by amount sign

```
finance-api/src/transactions/csv/revolut-parser.spec.ts
  F05: a positive-amount internal transfer/top-up is classified as plain income

AssertionError: expected 'income' not to be 'income'
```

`revolut-parser.ts:103` — `type: amount.startsWith('-') ? 'expense' :
'income'`. `import-commit.dto.ts:10` explicitly rejects `'transfer'` on
commit; no pairing/classification logic exists.

### F08 — simulator verdict with incomplete data

```
web/lib/simulator.spec.ts
  F08: a large purchase with zero spending data (no rules, no essentialSpend)
       still returns an unqualified 'yes'

AssertionError: expected 'yes' not to be 'yes'

web/components/SimulatorPanel.spec.tsx
  F08: clearing the purchase amount silently produces a guaranteed
       affordable verdict

expected document not to contain element, found <p class="...">
  Yes — this purchase looks affordable.
</p>
```

`simulator.ts` has no transactions/spending-history input; a purchase under
the provisional 10%-of-balance threshold is `"yes"` regardless of real
spending. `SimulatorPanel.tsx`'s `toBani(amountText || "0")` coerces a
cleared/unparseable amount to a 0 RON purchase with no UI signal.

### F10 — money DTOs are unguarded JS numbers

```
finance-api/src/transactions/dto/create-transaction.dto.spec.ts
  F10: accepts a 3-decimal-place amount, which the NUMERIC(14,2) column
       would silently round
  F10: accepts a negative amount on an income-type transaction
       (sign/type mismatch)

AssertionError: expected true to be false  (both)
```

`CreateTransactionSchema.amount` is a bare `z.number()` — no
`.multipleOf(0.01)` (unlike `import-commit.dto.ts`, which has one with a
comment explaining exactly this rounding hazard), no sign/type
cross-check.

### F11 — internal JWT claims, rate limiting, idempotency

```
finance-api/src/auth/internal-auth.guard.spec.ts
  F11a: accepts a correctly-signed token with no subject claim
  F11a: accepts a correctly-signed token with an unrelated issuer/audience

AssertionError: promise resolved "true" instead of rejecting  (both)

finance-api/test/improvements-findings.e2e-spec.ts
  F11c: rapid repeated wrong-password login attempts are never rate-limited

AssertionError: expected [401,401,401,...] to include 429

  F11d: an identical POST /transactions sent twice creates two rows
        instead of one

AssertionError: expected 2 to be 1
```

`internal-auth.guard.ts:31` calls `jwtVerify(token, secret)` with no
options — no `alg`/`iss`/`aud` check, and `Number(payload.sub)` on a
missing subject silently produces `NaN` rather than rejecting. No rate
limiter exists anywhere in the service (`grep` for
throttle/rate-limit/slowdown across all three services: 0 matches). No
write endpoint accepts or checks an idempotency key.

### F16 — CSV export: formula injection and BOM (charset claim corrected)

```
finance-api/src/transactions/csv/csv-escape.spec.ts
  F16: does not neutralize a leading-= formula-injection payload

AssertionError: expected '=cmd|\'/c calc\'!A1' not to be '=cmd|\'/c calc\'!A1'

finance-api/src/transactions/transactions.service.spec.ts
  F16: exportCsv omits the UTF-8 BOM needed for reliable spreadsheet import

AssertionError: expected false to be true
```

`csv-escape.ts` only triggers on `" , \r \n` (RFC 4180 quoting) — no
handling of a leading `=`/`+`/`-`/`@`. Applied to `category` and account
`name`, both user-controlled (category can arrive verbatim from an
imported CSV's `Type` column, see F06). `exportCsv` returns a plain string
with no `﻿` prefix.

**Correction — charset sub-claim is FALSE:**

```
finance-api/test/improvements-findings.e2e-spec.ts
  F16 (corrected): GET /transactions/export already declares
       charset=utf-8 via Express default

PASSED — Content-Type: "text/csv; charset=utf-8"
```

The review's source-inspection pass read `@Header('Content-Type',
'text/csv')` and concluded no charset was set. At the wire level, Express's
`res.set`/`res.type` appends `; charset=utf-8` automatically for known
`text/*` MIME types — a framework default the source alone doesn't show.
Kept as a passing regression guard. **This is exactly the failure mode the
review itself warns against** (asserting behavior from source reading
instead of running it) — one instance of it was found in the review's own
P0 findings.

### F17 — test isolation (see V0)

Dev-DB sub-claim: was true, fixed by V0 above. User-count-test sub-claim:
already false at `c12f5f3` — the assertion was removed in commit `a7dbda6`
("fix: unbreak CI on fresh environments"), confirmed by reading
`prisma.service.spec.ts` at HEAD (self-seeds a user, asserts nothing about
a pre-existing count).

### F18 — import commit trust boundary

```
finance-api/src/transactions/dto/import-commit.dto.spec.ts
  F18: accepts an oversized rows array with no upper bound

AssertionError: expected true to be false

finance-api/test/improvements-findings.e2e-spec.ts
  F18: import/commit accepts an invented row with no prior preview call

AssertionError: expected 201 to be greater than or equal to 400
```

`ImportRowSchema` takes `hash`, `occurredOn`, `type`, `amount`, `category`
all from the client; `hash` is only `min(1)`, never recomputed or looked
up. No staging/batch table exists anywhere in the schema. `commitImport`
checks only account ownership before inserting the posted rows verbatim.
`rows` has `.min(1)` and no `.max()` — the 5000-row parser cap lives only
on the `/import/preview` path and does not apply to commit.

### F06, F07, F09, F12, F13, F14, F15 — P1, inspection evidence

**F06 — TRUE.** `revolut-parser.ts:105` assigns the bank operation code
(`record.Type`) as `category`. `Description` (the merchant) is dropped at
commit — no `description` field in `ImportRowSchema`, and `Transaction`
has **no description/note column at all** in `schema.prisma`. Structurally
unstorable, not just unmapped.

**F07 — TRUE.** `grep -rn "@Patch\|@Delete\|@Put" finance-api/src/{transactions,recurring-rules,accounts}` →
zero matches. No transaction edit/void, no recurring-rule pause/edit, no
account archive endpoint exists anywhere in the API.

**F09 — TRUE, but deliberate — needs a decision, not a fix.** Four
independent recurrence engines: `analytics-service/forecast.py`,
`web/lib/forecast-occurrences.ts`, `web/lib/simulator.ts`,
`web/lib/forecast-window.ts`. The duplication is explicitly intentional,
stated in source comments (`simulator.ts:29-33`: *"a second,
separately-written occurrence engine so the simulator and the forecast
chart can act as a cross-check on each other"*) and recorded in
`CLAUDE.md` (Epic 8 Story 11 — the user was shown this exact fork before
Story 9's engine existed and chose a second independent implementation
over reuse). `improvements.md`'s S08 proposes collapsing these into one
authoritative engine — that is a **reversal** of a recorded decision, not
a bug fix. See V2 below.

**F12 — TRUE.** `grep -rn "AbortSignal|signal:|timeout" web/{app,lib,components} --include='*.ts' --include='*.tsx'`
→ 0 matches outside test files. `web/app/(dashboard)/simulator/page.tsx:35-44`
has an empty `catch` that silently substitutes a 30-day window and null
reserve with no UI signal, while `forecast/page.tsx` fails loudly for the
identical outage (renders `ForecastUnavailable`).

**F13 — TRUE.** `grep -rn "@Query" finance-api/src` → 0 matches repo-wide.
`transactions.service.ts:53-57` is an unbounded `findMany`. The full array
is serialized into the client bundle and filtered/sorted/aggregated in JS
on every keystroke (`TransactionsExplorer.tsx`, `overview-metrics.ts`).

**F14 — TRUE, worse than stated.** `Sidebar.module.css:1-7` —
`width: 250px; flex-shrink: 0`, no breakpoint. `grep -rn "@media" web --include='*.css'`
→ **0 matches across all 28 stylesheets in the app** — not just the
sidebar.

**F15 — PARTLY FALSE.** README staleness: true and severe (says "No
application code yet", ~60 commits and 15 days stale). Deploy: true,
nothing exists (`find .github -type f` → only `ci.yml`). **CI: false** —
`.github/workflows/ci.yml` runs build+typecheck+lint+test for all three
services with a real Postgres service container, added in commit `c12f5f3`
(HEAD) itself — the review was almost certainly written against a snapshot
from before that merge.

---

## V2 — roadmap revision

### 1. F09 / S08 — needs a decision before any implementation

`improvements.md` §12 (S08) proposes moving all forecast/simulation
arithmetic into Analytics Service, retiring `web/lib/simulator.ts`'s
independent engine. This directly reverses the choice recorded in
`CLAUDE.md`: the user was shown the alternative (reuse
`forecast-occurrences.ts`) and picked a second independent implementation
specifically as a cross-check. Recommendation: **do not implement S08
silently**. Two real options:

- **Keep 4 engines, add a cross-check test** that asserts
  `simulator.ts`'s and `forecast.py`'s outputs agree on the same synthetic
  input (already flagged as missing in the Epic 11 Story 11 log — "nothing
  currently asserts it"). Closes the actual risk (silent divergence)
  without touching the architecture.
- **Consolidate**, accepting the loss of the cross-check property, if the
  user decides duplication cost now outweighs its benefit.

Either way, write an ADR recording the decision before touching S08.

### 2. Work S01/S00 already covers

- S01 (CI) is largely done — `.github/workflows/ci.yml` already runs
  build/typecheck/lint/test for all three services against a disposable
  Postgres container. Remaining from S01: Python dependency pinning
  (`requirements.txt` has no version pins), secret scanning, branch
  protection — all still open.
- S00's test-isolation subset (S00.2/S00.3/S00.9) is done by this
  branch's V0. The rest of S00 (deterministic seed data, injectable clock,
  demo seed) is still open and should stay in scope.

### 3. Corrections to carry forward

Two S15/D-matrix items assume findings that are false as written:

- Any acceptance check derived from F15's "CI is planned, not
  implemented" should be dropped — CI exists.
- F17's user-count-test framing (S00.9) is already resolved; nothing left
  to do there beyond V0's isolation fix.
- F16's charset framing (part of S06.12/D24) should read "verify BOM is
  present," not "verify charset is set" — the latter already passes.

### 4. MVP-boundary classification

Per `CLAUDE.md`'s locked MVP scope (RON-only, no bank integration, no
monetization, no AI), the following phases are plausibly **post-MVP** and
should not block a real-data beta on their own:

- S09.8 (history-based budget suggestions) — explicitly opt-in, needs
  "enough complete periods" of real usage first; can't be built before
  real users exist anyway.
- S11.4/S11.5 (recurring ownership costs, saved scenarios) — genuinely
  useful, not blocking the core spendable-amount question.
- S15.8–S15.10 (5–10 user pilot, product-validation metrics) — by
  definition happens after the MVP-blocking work, not as part of it.

**MVP-blocking floor** = every P0 finding (F01–F05, F08, F10, F11, F16,
F17, F18) plus their direct dependencies: S02 (contracts), S03 (balances),
S04 (auth/security), S05–S06 (transactions/import — needed for F04–F06 and
F18 together, see #5 below), S08's cross-check-only variant (not full
consolidation, per #1).

### 5. Sequencing correction found during V1

F06 (description field) and F05 (transfer type on import) both require the
same schema change — `Transaction` needs a `description` column, and
import needs to be able to emit something other than `income`/`expense`.
`improvements.md` places these in S05 and S06 respectively, one phase
apart; they should be one migration, done together, to avoid two `ALTER
TABLE` passes on the same table for adjacent concerns.

### 6. First slice (capacity-bounded, ~20h/week)

Given ~200 checkboxes and no established velocity yet, the right unit is
sprints, not a date for S15. Recommended first 3-sprint slice, in
dependency order:

1. **S02** (financial contracts, `docs/financial-rules.md` + ADRs) — no
   code, unblocks everything else, and forces the F09/S08 decision from
   #1 explicitly.
2. **S03** (F01, F02) — the two P0 balance-correctness findings, now
   backed by V1.1/V1.2's failing tests as the acceptance criteria.
3. **S04 partial** (F11's four sub-findings only — JWT claims, session
   revocation, rate limiting, idempotency) — backed by V1.10–V1.13.

F04–F06 and F18 (import correctness/trust) are the natural next slice
after that, already scoped as one combined migration per #5.

---

## Files touched by this validation

- `finance-api/vitest.config.ts`, `vitest.config.e2e.ts`,
  `test/setup-db-guard.ts`, `.env.test.example`, `.gitignore` — V0 test
  isolation.
- `finance-api/src/accounts/accounts.service.spec.ts` — F01, F02.
- `analytics-service/test_forecast.py` — F03.
- `finance-api/src/transactions/csv/revolut-parser.spec.ts` — F04, F05.
- `web/lib/simulator.spec.ts`, `web/components/SimulatorPanel.spec.tsx` — F08.
- `finance-api/src/transactions/dto/create-transaction.dto.spec.ts` — F10.
- `finance-api/src/auth/internal-auth.guard.spec.ts` (new) — F11a.
- `finance-api/test/improvements-findings.e2e-spec.ts` (new) — F11c,
  F11d, F16 (charset correction), F18.
- `finance-api/src/transactions/csv/csv-escape.spec.ts`,
  `transactions.service.spec.ts` — F16.
- `finance-api/src/transactions/dto/import-commit.dto.spec.ts` — F18.

Full-suite results on this branch: `finance-api` unit 110/121 pass (11
expected new failures), `finance-api` e2e 2/5 pass (3 expected new
failures), `web` 218/220 pass (2 expected new failures),
`analytics-service` 19/20 pass (1 expected new failure). No pre-existing
test regressed.

# Saldovio — Financial rules

Epic 13, Story 1 (S02.1, S02.2, S02.3, S02.8, S02.10). Companion ADRs cover
the remaining S02 items:
- S02.4/S02.5 (opening balance, current balance) → `docs/adr/0002-*` (Epic 13 Story 3, not yet written)
- S02.6/S02.7/S02.9 (projection interval, reserve, scope) → `docs/adr/0003-*` (Epic 13 Story 4, not yet written)
- Entity/field additions implied by this doc → `docs/roadmap/...` target-model doc (Epic 13 Story 5, not yet written)

This file documents conventions, not aspirations — most of it is already how
the codebase works today (see `CLAUDE.md`'s progress log for where each
pattern was first established); it exists so every future service reimplements
the same rule instead of a plausible-looking variant.

## 1. Monetary transport (S02.1)

- **Authoritative storage:** PostgreSQL `NUMERIC(14,2)` — exact decimal,
  never a float. Established Sprint 2.
- **Wire format:** decimal strings with at most 2 fractional digits for RON
  (e.g. `"150.00"`), never a JSON number. Confirmed via context7 that
  Pydantic v2 always serializes `Decimal` as a string for this reason
  (Analytics Service, Sprint 6).
- **In-process arithmetic:**
  - Finance API (Prisma): `Decimal.js` objects, converted to strings at the
    API boundary via `toDecimalString` (`finance-api/src/common/serialization.ts`).
  - Web: integer minor units (bani) — `toBani`/`baniToDecimalString`
    (`web/lib/money.ts`). Never `parseFloat` on an API decimal string;
    string-sliced instead, to avoid reintroducing float error at the one
    layer (`NUMERIC(14,2)` → JS) where precision could otherwise leak in.
  - Analytics Service: Python `Decimal` throughout `forecast.py`.
- **Bounds:** `NUMERIC(14,2)` allows up to 12 integer digits — far beyond
  any plausible personal-finance balance. Web's bani representation uses a
  JS `number`, safe up to `Number.MAX_SAFE_INTEGER` (~9×10¹⁵ bani = ~9×10¹³
  RON) — also not a real limit for MVP scope, but the ceiling is worth
  stating: a future multi-currency or business-accounts feature would need
  to revisit whether bani-as-`number` still holds.
- **Validation order:** parse the wire string, validate it matches
  `^-?\d+\.\d{2}$` (or unsigned per S02.2 below), *then* convert — never
  convert-then-validate, which is how malformed input silently becomes `0`
  or `NaN`.

**Worked example:** API returns `"1234.50"` for a balance. Web parses via
`toBani("1234.50")` → `123450` (integer bani), never
`parseFloat("1234.50") * 100` → `123449.99999999999` (real float artifact
this project has hit before and specifically works around).

## 2. Transaction sign convention (S02.2)

- **Income:** positive amount.
- **Expense:** negative amount.
- **Transfer:** two linked legs (source, destination), each independently
  signed — negative on the source account, positive on the destination.
  Never modeled as an expense-on-A + income-on-B pair of *unlinked* rows
  (brief §11 rule 1) — the two legs must be atomically linked so a partial
  write is detectable and rejects, not just conventionally opposite-signed.
- **Adjustment:** signed, sized to the correction needed (a reconciliation
  adjustment of "we're 80 RON short" is `-80.00`, not a magnitude with a
  separate direction field).
- **Recurring rules store a positive magnitude, not a signed amount** — the
  sign is applied by the consuming formula based on `type`, not stored
  (decided Epic 8 Story 8, `CLAUDE.md` progress log). This is a deliberate
  asymmetry with `Transaction`, not an inconsistency to "fix": a recurring
  rule describes a magnitude that recurs; only a materialized transaction
  or occurrence has a signed effect on a balance.
- **Zero-value entries are rejected** for `income`/`expense`/`transfer` —
  enforced in both the API DTO (Zod, already `@IsPositive()`-equivalent for
  recurring-rule amounts since Epic 6) and a DB `CHECK` constraint, so a
  client bug can't insert a no-op row that inflates transaction counts
  without changing any balance. `adjustment` is the one type where a
  zero-value row is meaningless by definition (an adjustment *is* the
  nonzero correction) and is rejected the same way, not special-cased.

**Worked example:** a 500 RON transfer from Checking to Savings is one
`Transfer` record with two legs: Checking leg `-500.00`, Savings leg
`+500.00`, linked by a shared transfer ID, committed atomically. Total
balance across both accounts is unchanged (`-500 + 500 = 0`), matching
brief §11 rule 1.

## 3. Dates and timezone (S02.3)

- **Single business timezone**, not per-request or per-browser. RON/Romania
  MVP scope → `Europe/Bucharest`. Stored and compared as calendar dates
  (`YYYY-MM-DD`), never a timestamp-with-implicit-timezone for anything
  that represents "which day did this happen."
- **No `Date` object for date arithmetic or comparison**, anywhere in the
  stack. This is now independently enforced at 5 layers, each with its own
  test, deliberately not trusted to hold "because it holds elsewhere"
  (Sprint 2 `pg` DATE parsing → Prisma serialization → Analytics Pydantic
  layer → `web/lib/forecast-occurrences.ts`/`simulator.ts`/`forecast-window.ts`
  string-math). Any new date logic is a 6th enforcement, written the same
  way, verified by its own test — not assumed correct by analogy.
- **Explicit calculation date passed through every request** that computes
  a balance or forecast — never independently derived as "today" inside
  each service. A single calculation date, decided once (by Web, which
  owns the user-facing "now"), flows through Finance API and Analytics
  Service as an explicit field. This is what S08.6's same-day-ordering
  note and S02.5's current-balance definition both depend on: two services
  computing "today" independently, even microseconds apart, could
  disagree at a UTC midnight boundary.

**Worked example:** a purchase-simulation request computes `calculationDate
= "2026-09-23"` once in Web (from the server's business-timezone clock),
and sends that same string to Analytics Service. Analytics does not call
its own "now" — if it did, a request straddling midnight UTC could see
Finance API's "today" and Analytics' "today" disagree by one day, silently
shifting which recurring rule occurrences count as already-elapsed.

## 4. Transaction and occurrence state semantics (S02.8)

Two different state machines, not one — a `Transaction` is something that
happened (or is explicitly planned to); an `Obligation occurrence` (Epic 17,
not yet built) is one dated instance of a recurring rule's expected
payment/income, with its own lifecycle independent of whether a matching
`Transaction` exists yet.

**`Transaction.lifecycle`** (field not yet added — target-model doc, Epic
13 Story 5):
| State | Affects actual cash? | Affects income/expense reports? | Affects projection? |
|---|---|---|---|
| `actual` | Yes | Yes | Yes (as already-elapsed) |
| `planned` | No | No | Yes (as a future expected event, same as a recurring occurrence) |
| `voided` | No | No | No — excluded everywhere, not just zeroed |
| `adjustment` | Yes | No (it's a correction, not new income/expense) | Yes (changes the balance it corrects) |

**`Obligation occurrence.status`** (Epic 17 Story 3):
| State | Meaning |
|---|---|
| `planned` | Expected, no matching transaction yet, date in the future |
| `partial` | Some but not all of the expected amount is matched/allocated |
| `paid` | Fully matched to one or more transactions (brief §11 rule 2 — the rule and the confirming transaction are never both subtracted; matching is what prevents that, not manual bookkeeping) |
| `overdue` | Expected date has passed with no full match |
| `postponed` | User explicitly moved this occurrence's expected date without changing the underlying rule |
| `skipped` | User explicitly marked this occurrence as not happening, distinct from `voided` (which is for transactions, not occurrences) |

**Worked example:** a recurring rent rule generates a `planned` occurrence
for the 1st. The user pays it on the 3rd — a `Transaction` (`lifecycle:
actual`) is created and matched to the occurrence, which moves to `paid`.
The forecast, reading occurrence state rather than re-deriving "is this
paid" from date proximity, does not also subtract the rule's raw monthly
amount for that period — closing the exact bug class brief §11 rule 2 and
Epic 17's acceptance criteria (D04-D06, "the original paid-twice bug")
target.

## 5. Rounding and allocation (S02.10)

Splitting a total amount across N days (e.g. a variable-spend budget over
remaining days in a period) uses the **largest-remainder method**, in
integer bani, never floating-point division:

1. `base = floor(totalBani / N)` for every day.
2. `remainder = totalBani - (base * N)` — always `0 <= remainder < N`.
3. Compute each day's exact fractional share `totalBani / N` and rank days
   by the size of the fractional part *not* captured by `base`.
4. The `remainder` days with the largest fractional remainder each get one
   extra bani (`base + 1`); the rest get exactly `base`.
5. Ties (equal fractional remainder) break by date order (earliest day
   first) — deterministic, not implementation-dependent iteration order.

This guarantees the daily allocations sum to exactly `totalBani` (no
leftover cent silently dropped or duplicated) and spreads the rounding
adjustment across multiple days rather than concentrating it on one
arbitrary day (first or last), which would make that day's allowance look
like a computed anomaly to the user.

**Worked example:** `totalBani = 10000` (100.00 RON) over `N = 3` days.
`base = floor(10000/3) = 3333`, `remainder = 10000 - 9999 = 1`. All three
days have the identical fractional remainder (`0.333...`), so the tie-break
rule applies: the earliest day gets `3334`, the other two get `3333` each.
Sum: `3334 + 3333 + 3333 = 10000`. ✓

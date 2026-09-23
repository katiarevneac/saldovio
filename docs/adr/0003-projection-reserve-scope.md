# ADR 0003: Projection interval, reserve vs. variable-spend budget, total-assets vs. spendable scope

Date: 2026-09-23
Status: Accepted
Epic: 13, Story 4

## Context

`improvements.md` S02.6/S02.7/S02.9 ask for three related definitions to be
locked before Epic 19 (S09, variable budgets/reserve) and Epic 21 (S11,
purchase scenarios) build on them. Two of the three (starting-cash-as-a-
minimum-candidate, and the total-assets/spendable scope split) were already
partly decided in `docs/adr/0001-authoritative-forecast-engine.md` (S08.6,
S08.8) while writing that contract — this ADR is the single place those
decisions get stated in full, cross-referencing rather than duplicating.

## Decision

### 1. Projection interval (S02.6)

The existing convention is the ADR-of-record, not a new decision:
`[calculationDate, windowEnd)` for dated cash events — a recurrence landing
exactly on `calculationDate` is included, one landing exactly on
`windowEnd` is not. Implemented in `web/lib/forecast-window.ts` and
`analytics-service/forecast.py`'s occurrence helpers; first defined as
"sold estimat" (`CLAUDE.md`, 2026-09-08, window revised 2026-09-15).

**The final chart point:** the daily-balances series (Epic 8 Story 8)
includes `windowEnd` itself as its last data point, even though the event
interval that produces it is half-open. This is not a contradiction: the
series is a display of *balance on each day*, not a list of events: the
half-open event interval guarantees `windowEnd`'s own delta is always
zero (no event is dated exactly on the excluded boundary), so the series'
last point is simply "balance carried forward, unchanged, as of
`windowEnd`." Both conventions coexist because they answer different
questions — "did an event happen on this day" (exclusive at the boundary)
vs. "what's the balance as of this day" (the series covers the boundary
day too, trivially).

**Starting available cash as a separate minimum candidate:** decided in
ADR 0001 (S08.6) — today's starting cash is itself a possible minimum,
evaluated before any of today's inflows apply, so a salary landing later
today cannot mask an immediate purchase shortfall. Not re-decided here;
this ADR only cross-references it because S02.6 names the same
requirement.

### 2. Reserve vs. variable-spend budget (S02.7)

Two distinct concepts, not one field with two meanings:

- **Reserve** — a minimum retained amount. A floor: money the projection
  must never plan to spend below. It is not itself a forecast outflow and
  contributes nothing to projected income/expense totals; it only
  constrains what counts as "available" for a purchase-affordability
  verdict.
- **Variable-spend budget** — a planned, forecast periodic outflow (e.g.
  "expect to spend ~800 RON/month on groceries"). It *is* a forecast
  outflow, feeding the projection the same way a recurring rule does.
  Not built yet (Epic 19).

The old `Settings.essentialSpend` field maps 1:1 onto **Reserve** on
rename, not onto the variable-spend budget: it was already used as a floor
in the simulator's verdict threshold (`thresholdBasis: "essential-spend"`,
Epic 11 Stories 2+3), never as a spend report. Epic 19 Story 1 executes the
rename with a user-facing explanatory notice (already scoped in
`improvements.md` S09.1); this ADR fixes the target terminology so that
story has an unambiguous name to rename to, rather than inventing one
mid-implementation.

### 3. Total-assets vs. spendable scope (S02.9)

- **`Account.protectedSavings: boolean`**, default `false`. No DB default
  omission here unlike ADR 0002's `openingBoundary` — `false` is the
  correct default for every existing and new account (an account is
  spendable unless explicitly marked otherwise), so an explicit column
  default is appropriate and there is no silent-reinterpretation risk:
  no account currently has any notion of "protected," so defaulting to
  "not protected" changes nothing about how any existing balance is
  interpreted.
- **Total-assets aggregate** = sum of all accounts' balances, regardless
  of `protectedSavings`. This is the dashboard's existing "Total balance"
  KPI — unchanged.
- **Spendable-scope aggregate** = sum of accounts where `protectedSavings
  = false`.
- **Forecast, simulator, and purchase-scenario calculations use the
  spendable-scope aggregate as their starting balance by default — not
  opt-in.** This follows directly from S02.9's own wording ("Protected
  savings contribute to total assets but not automatically to purchase
  affordability") rather than being a fresh design choice. The
  `scope`/`startingBalanceByScope` field ADR 0001 added to the Analytics
  request contract carries this value; total-assets is never fed into an
  affordability calculation, only shown as a separate display figure.
- A transfer into or out of a `protectedSavings` account changes only the
  scope aggregate it actually affects (S08.8, restated): moving 200 RON
  into a protected savings account reduces the spendable-scope total by
  200 and leaves total-assets unchanged; it does not appear as an
  "expense" in either scope, consistent with `docs/financial-rules.md`
  §2's transfer convention.

## Consequences

- Epic 19 (S09) Story 1 implements the `essentialSpend` → Reserve rename
  and Story 2 builds the variable-spend budget as a genuinely separate
  field, per the definitions above — not folded into Reserve.
- Epic 14 (S03) Story 6 ("protected-savings configuration") implements the
  `Account.protectedSavings` field and its edit UI; this ADR fixes the
  field name and default so that story isn't renegotiating them.
- Epic 18 (S08) and Epic 21 (S11) purchase-scenario work consume the
  spendable-scope aggregate as the default starting balance, per the
  contract field ADR 0001 already added.
- No account currently has `protectedSavings = true` (the field doesn't
  exist yet), so nothing about today's displayed balances changes as a
  result of this ADR — it only fixes the target definitions for epics not
  yet built.

## Alternative considered

Make spendable-vs-total-assets an opt-in toggle per calculation (user
chooses which scope a given forecast/simulation uses). Rejected — S02.9's
wording is explicit that protected savings should *not* automatically
count toward affordability, i.e. the safe/conservative scope is the
default; an opt-in toggle would make the wrong (asset-inflated) number the
default unless the user remembers to narrow it, which the finding this ADR
resolves specifically avoids.

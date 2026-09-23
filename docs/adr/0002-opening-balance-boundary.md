# ADR 0002: Opening balance / reference-date boundary convention

Date: 2026-09-23
Status: Accepted
Epic: 13, Story 3

## Context

`Account.current_balance` is a snapshot as of `Account.reference_date`
(inclusive), established Sprint 2, with the balance formula
`current_balance + SUM(transactions WHERE occurred_on > reference_date)`
validated in Sprint 4 (S1). This means a transaction dated on or before
`reference_date`, added after the fact, is not reflected in the displayed
balance — documented as a known, by-design limitation in `CLAUDE.md`
("Known limitation — backdated transactions", found Sprint 4 S2). It is not
a bug: it exists specifically to prevent double-counting history already
baked into the stored snapshot (brief §11 rule 4).

The limitation has a real cost for the most common case: a brand-new
account, created today with an opening balance of 0, where the user
immediately logs today's income. Under the strict `>` comparison, that
same-day entry does not count until tomorrow — directly contradicting the
intuitive expectation a new user has.

`improvements.md` S02.4 asks for two things that appear to conflict:
retain existing accounts' inclusive interpretation (don't silently
reinterpret stored data) while giving new accounts a convention where
today's entries affect today's balance. This ADR resolves the conflict by
making the boundary convention a per-account, explicit field rather than a
single global rule.

## Decision

### `Account.openingBoundary`: `legacy_inclusive` | `start_of_day`

No DB column default. Every code path that creates an `Account` row sets
this field explicitly — consistent with this project's standing rule
against implicit/silent values (never a fabricated indicator, per brief
§11 rule 6; the same discipline applied here to schema intent).

- **Migration:** a one-time backfill sets `openingBoundary = 'legacy_inclusive'`
  on every existing row. This changes no computed balance — it makes the
  already-true formula explicit in the schema instead of implicit in
  application code.
- **New accounts** (`AccountsService.create`, and the auto-created default
  account in atomic signup): `openingBoundary = 'start_of_day'`, set in
  application code at insert time.

### Balance formula, per boundary

- `legacy_inclusive`: `opening_balance + SUM(transactions WHERE lifecycle
  = 'actual' AND NOT voided AND occurred_on > reference_date AND
  occurred_on <= calculationDate)` — unchanged from Sprint 4's formula.
- `start_of_day`: `opening_balance + SUM(transactions WHERE lifecycle =
  'actual' AND NOT voided AND occurred_on >= reference_date AND
  occurred_on <= calculationDate)` — the only difference is `>=` instead
  of `>`, so a transaction dated exactly on `reference_date` counts.
  `reference_date` under this boundary means "the balance as of the start
  of this calendar day," not "as of the end of it."

This is S02.5's current-balance definition made concrete: opening snapshot
plus applicable posted, non-voided, `actual`-lifecycle entries through the
calculation date. `planned` entries never affect it (S03's acceptance
criteria — tomorrow's planned expense leaves today's actual cash
unchanged), regardless of boundary.

### Legacy accounts: `legacy_inclusive` is permanent, no conversion path

An existing account's `openingBoundary` cannot later be switched to
`start_of_day`. The account's `current_balance` was computed and shown to
the user under inclusive semantics from the day it was created; switching
the interpretation later, even with a recomputation, changes what the
stored number *means* without the user having asked for that account's
balance to be redefined — the kind of silent reinterpretation the brief
explicitly rules out. A user who wants start-of-day behavior uses the
existing workaround: open a new account (already built, Sprint 5's
multi-account support, and already how the backdated-transaction
limitation gets worked around today for a "Cash"-style second account).

### What this does *not* fix

Anything dated **strictly before** `reference_date` is still assumed
already baked into the opening snapshot, under either boundary. This is
inherent to snapshot-based accounting, not a boundary-convention artifact
— an account's opening balance is, by construction, "everything before
this date, collapsed to one number." `start_of_day` only moves where the
line falls by one day (today counts vs. today doesn't); it does not give
either convention visibility into pre-snapshot history. S03.4's backdated-
entry preview (Epic 14) is the mitigation for this — showing the user the
entry won't move the balance, before they save it — not a fix, and this
ADR does not change that.

## Consequences

- Epic 14 (S03) Story 3 implements the per-boundary formula above,
  replacing Sprint 4's single hardcoded `>` comparison.
- Epic 14 Story 1's regression tests (existing inclusive snapshots
  unchanged; new-user same-day income/expense correct) become the literal
  acceptance test for this ADR's two formulas.
- `Account.lifecycle`-filtered transactions (S02.8, `docs/financial-rules.md`
  §4) is a prerequisite for the formula above being fully correct —
  `lifecycle` doesn't exist as a column yet (target-model doc, Epic 13
  Story 5). Until it ships, Epic 14 Story 3 can filter on `voided` alone
  (already exists conceptually via `S03.5`'s planned/actual distinction
  being enforced at write time rather than queried) and add the
  `lifecycle`-based filter once that column lands, without changing this
  ADR's decision.
- No new endpoint or UI surface — `openingBoundary` is set once at account
  creation, never edited by a user, so there is nothing to expose in
  Settings or the account-creation form beyond what already exists.

## Alternative considered

A single global convention change (retroactively recompute all accounts to
start-of-day). Rejected outright — this is exactly the "silently
reinterpret existing monetary data" the brief prohibits (brief §11,
introductory rule), and was never seriously on the table once that rule is
taken as binding.

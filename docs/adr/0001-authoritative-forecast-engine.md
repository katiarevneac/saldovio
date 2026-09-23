# ADR 0001: One authoritative forecast/simulation engine

Date: 2026-09-23
Status: Accepted
Epic: 13, Story 2 (blocks Epic 18 / S08)

## Context

Four independent recurrence/forecast engines exist: `analytics-service/forecast.py`,
`web/lib/forecast-occurrences.ts`, `web/lib/simulator.ts`, `web/lib/forecast-window.ts`.

The duplication between `simulator.ts` and the chart/forecast path was
deliberate: Epic 8 Story 11 (see `CLAUDE.md` progress log) explicitly
considered reusing `forecast-occurrences.ts` for the simulator and chose a
second independent implementation instead, specifically as a cross-check
between simulator and chart.

`improvements.md` finding F09 flags this duplication as a P1 risk. Its
proposed fix, S08, is to collapse all forecast/simulation arithmetic into
Analytics Service and make Web presentation-only — a reversal of the Epic 8
Story 11 decision, not a bug fix. `docs/validation/2026-09-23-improvements-validation.md`
(V2 §1) confirmed F09 is true-but-deliberate and required this ADR before any
S08 code is touched.

## Decision

**Analytics Service (`forecast.py`) becomes the sole authoritative
forecast/simulation engine.** Web orchestrates rendering and requests only;
it performs no parallel forecast or simulation arithmetic.

Reason for reversing the Epic 8 Story 11 decision: with the app growing past
a size one person can hold fully in their head, four engines to keep in sync
by hand is a real maintenance burden, and a single engine is a simpler
mental model to reason about and teach yourself — outweighs the cross-check
property the duplication bought.

### Retired (deleted after rollout verification, not just deprecated)

- `web/lib/simulator.ts` — purchase-simulation math moves to Analytics. A
  purchase becomes one more dated cash event in the forecast request.
- `web/lib/forecast-occurrences.ts` — chart-annotation occurrence derivation
  (Weeks/Calendar rule-day cards) retired. Analytics returns per-day event
  explanations (see contract below) instead of Web re-deriving them from raw
  recurring rules.

### Kept unchanged

- `web/lib/forecast-window.ts` — payday/window computation. This is
  request-shaping, not forecast arithmetic: it depends on `Settings`
  (payday, horizonDays), which lives in Web/Finance API, not Analytics.
  Remains the single place `windowEnd` is decided; both the baseline
  forecast call and the purchase-simulation call use its output, so they
  never compute the window with different clocks (S08.5).
- Chart bucketing/display code (`forecast-chart-data.ts` and similar) — pure
  formatting over whatever series Analytics returns, not itself an engine.

### Occurrence clamping stays in Analytics

Finance API resolves ownership and persisted occurrence state (which rules
exist, their active/paused status). Analytics keeps owning the actual
occurrence clamping arithmetic (e.g. day 31 in a 30-day month) — that is
projection arithmetic, not data extraction, so it does not move to Finance
API. Only the *duplicate* copies of this logic in Web are retired.

### Contract extension

**Request**, in addition to what the endpoint already accepts:
- Explicit dated cash events (recurring rule occurrences, plus an optional
  hypothetical purchase event for simulation calls)
- Calculation date
- Starting balance **by scope** — total-assets vs. spendable-cash, so
  excluded/savings accounts can be modeled correctly once S09 needs it. The
  field is added now so S09 does not force a second contract break.
- Reserve amount (nullable — see S08.7 below)
- Bounded window (`window_end_date`, already required per the Epic 11
  Story 1 change)

All request and response shapes are validated at the service boundary.

**Response**, full field set per S08.4:
- Daily balances (already shipped, Epic 8 Story 8)
- Starting availability (today's cash)
- Minimum projected balance + its date
- End-of-window balance
- Event explanations (which dated cash events landed on which days)
- Formula version
- Calculation timestamp
- Input-completeness flag

**S08.6 — same-day ordering:** today's starting cash is itself a possible
minimum, evaluated before any future inflow is applied. The response makes
explicit that daily aggregation does not prove intraday payment ordering:
when two or more dated events land on the same day, their combined effect
on that day's balance is correct, but which one is "paid first" that day is
not determined or claimed.

**S08.7 — unavailable reserve:** when the reserve/essential-spend input is
unavailable or invalid, the response returns an explicit unavailable/
incomplete state. It never silently substitutes the old 10%-of-balance rule
to produce a confident purchase verdict. This is a deliberate behavior
change: `web/lib/simulator.ts`'s current `thresholdBasis: "balance-percent"`
fallback path (Epic 11 Stories 2+3) retires along with the file. The
Simulator UI must show an explicit "set essential spend in Settings for a
confident verdict" state instead of a verdict computed on the 10% default.

**S08.8 — scope:** the starting-balance scope field distinguishes
total-asset projections from spendable-cash projections, so a transfer
into/out of an excluded account changes only the balance of the scope it
actually affects. Full enforcement (which accounts are excluded) lands with
S09 (reserve/budgets); the field exists in the contract from this migration
onward.

### Testing strategy (replaces the cross-check test)

**S08.3 — permanent fixture-based tests.** Analytics keeps a standing test
suite of hand-computed expected outputs for known synthetic inputs. This is
what "independent expected-result fixtures" (per `improvements.md` S08.3)
means going forward, replacing the three-competing-engines cross-check that
duplication used to provide.

**S08.9 — rollout gate.** Before `simulator.ts` and `forecast-occurrences.ts`
are deleted, Epic 18 runs an old-vs-new comparison of the retiring Web logic
against the extended Analytics contract on synthetic and sanitized real
fixtures, classifies any differences as intentional (e.g. the S08.7 verdict
change above) or a bug, and only removes the old code once verified. This is
a one-time migration gate, separate from and in addition to the standing
S08.3 fixture suite.

## Consequences

- Epic 18 (S08) is a real migration — contract extension, two file
  retirements, call-site rewiring in `ForecastChart`, `SimulatorPanel`,
  `SimulatorCard`, and both the Overview and `/simulator` pages, plus a
  user-visible verdict-UI change (S08.7) — not the lighter cross-check-test
  scope originally sketched in `docs/roadmap/2026-09-23-epic-sprint-backlog.md`.
  That backlog doc's Epic 18 section needs rescoping before Epic 18's
  Sprint 1 starts; not done as part of this ADR.
- The cross-check property Epic 8 Story 11 deliberately bought is given up.
  Its risk (silent divergence between engines) is replaced by: (a) one
  engine, so there is nothing to diverge, and (b) the S08.3 fixture suite
  as the standing correctness check.
- S09 (variable budgets/reserve) can build directly on the scope field
  (S08.8) and the reserve-unavailable state (S08.7) added here, instead of
  extending the contract again.

## Alternative considered

Keep 4 engines, add a cross-check test asserting `simulator.ts` and
`forecast.py` agree on shared synthetic fixtures. Rejected: closes the
silent-divergence risk without addressing the underlying maintenance cost of
four engines, which is the reason given for revisiting the decision now.

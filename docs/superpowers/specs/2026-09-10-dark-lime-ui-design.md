# Design: Dark/Lime UI — Reskin + Simulator + Forecast (sub-projects 2+3+4 merged)

## Context

Sprint 6 decomposed the dark/lime UI handoff (`design_handoff_saldovio_dashboard/`) into 5 sequential sub-projects: (1) technical foundation [done, Sprint 7], (2) visual reskin, (3) Simulator, (4) dedicated Forecast screen, (5) Settings + CSV import.

During this spec's brainstorming session, the user explicitly chose to merge (2), (3), and (4) into one Sprint 8 epic rather than keep them sequential, after being shown the scope tradeoff (roughly 3x any prior sprint, and a deviation from brief §13's "one roadmap stage at a time" guidance). This is a deliberate, confirmed decision, not an oversight — recorded here so the scope jump is explained if revisited later.

Settings + CSV import (sub-project 5) remain out of scope.

## Decisions (confirmed with user before writing this spec)

- **Routes**: split the current single dashboard page into `/` (Overview), `/transactions`, `/accounts`, matching the design's sidebar nav, rather than reskinning the single-page layout in place.
- **Sidebar**: all 6 nav items visible; Forecast/Simulator/Settings render disabled (no link, muted) until this epic builds the first two and sub-project 5 builds the third.
- **Add-transaction**: becomes a modal (per design), not an inline form.
- **Recurring rules**: stay on Overview (not in the original design, which only shows them on the Forecast screen) rather than disappearing from the UI or moving to Accounts.
- **Overview's forecast/simulator content**: real chart and real simulator card, not stand-ins — this is what pulled sub-projects 3 and 4 into this epic.
- **Dedicated `/forecast` and `/simulator` routes**: built in full (all 3 chart modes, all 3 comparison views), not deferred.
- **Login/signup**: reskinned to the same token set for visual consistency, even though not in the 6-screen handoff.
- **Charting**: Recharts adopted (moves from "proposed" to locked-in per CLAUDE.md's tech-stack table) for the Line chart mode. Weeks and Calendar modes are hand-built (not standard chart shapes, no library benefit).
- **Analytics Service extension**: `/forecast` response gains a `dailyBalances` series (backward-compatible addition, not a new endpoint) — needed once it became clear the chart requires a day-by-day trajectory, not just the day-30 endpoint value.
- **Simulator calculation**: independent client-side reimplementation of the recurrence/occurrence math in TypeScript (`web/lib/simulator.ts`), not derived from the fetched daily series. This is a deliberate 4th independent implementation of "sold estimat"-family logic (after `pg`, Pydantic, Prisma), consistent with this project's standing pattern of re-verifying money/date logic at every layer rather than assuming it holds because it worked elsewhere.
- **Verdict thresholds**: No = minimum-after-purchase balance < 0; Tight = 0 ≤ minimum-after < 10% of current total balance; Yes = ≥ 10%. Documented as a provisional rule (percentage-of-balance, not essential-spend-based) pending Settings' essential-spend field (sub-project 5). A single named constant, trivially swapped later.

## Architecture

### Epic breakdown (sequential stories)

1. Design tokens + Archivo font + shared layout shell
2. Sidebar nav + route split (`/`, `/transactions`, `/accounts`)
3. Overview reskin (KPI cards, recurring rules, account/transaction summaries)
4. Add-transaction modal
5. `/transactions` page (filters, density modes)
6. `/accounts` page (summary + account cards)
7. Login/signup reskin
8. Analytics Service: daily balance series extension
9. Shared `ForecastChart` component (Line/Weeks/Calendar)
10. `/forecast` page + Overview chart embed
11. Simulator calc engine (`web/lib/simulator.ts`) + verdict thresholds
12. `/simulator` page + Overview simulator card embed

Given the size, Jira planning after this spec may split these into sub-epics or a longer sprint window — that decision happens at the writing-plans/Jira stage, not here.

### Design tokens & shared layout

`web/app/globals.css` gets the full dark/lime token set as CSS custom properties: backgrounds, surface, divider, text (primary/secondary/tertiary), accent lime + tints, expense tint, verdict colors (yes/tight/no), radius scale (16px cards, 12px inputs/buttons, 99px pills), spacing (14-22px), type scale. Archivo loaded via `next/font/google` — verify current loading API against the locally bundled Next.js docs (`node_modules/next/dist/docs/`, per `web/AGENTS.md`) before implementing, since this Next.js version has documented breaking changes from training-data assumptions.

`web/app/layout.tsx` adds the sidebar shell: `web/components/Sidebar.tsx`, 250px fixed, 6 nav items. Overview/Transactions/Accounts are real `Link`s (active-state styling by current route); Forecast/Simulator/Settings render as non-interactive, muted list items — no `href`, no click handler, so there's nothing to accidentally navigate to before those routes exist.

### Route split

- `web/app/page.tsx` (Overview): KPI cards (balance, income, expenses, surplus — computed the same way as today, just restyled into `KpiCard` components), recurring rules section (unchanged data source, `getMyRecurringRules`), condensed accounts list, condensed recent-transactions list, forecast chart (Line mode, small), simulator card (condensed).
- `web/app/transactions/page.tsx` (new): full transactions table with filter bar (search input, category chips, density segmented control — compact/comfortable/by-day). Filtering happens client-side over the already-fetched list; no new API calls per filter change. Gated by `auth()` (layer 2), same pattern as every existing Server Component.
- `web/app/accounts/page.tsx` (new): summary card (total balance, reference-date note) + account cards grid, "% of total balance" computed client-side from the already-fetched `accounts` array (zero-total case returns "unavailable" per brief §11 rule 6, not a divide-by-zero NaN or fabricated 0%).
- No changes to `web/lib/transactions.ts`/`accounts.ts` — same data-fetching functions, reused across the 3 new pages.

### Add-transaction modal

`web/components/Modal.tsx`: generic dialog wrapper (client component), houses the existing `TransactionForm`. Trigger button ("+ Add transaction") opens it; the underlying Server Action (`createTransactionAction`) is unchanged — only the presentation shell (inline section → modal overlay) changes.

### Analytics Service: daily balance series

`analytics-service/forecast.py`: `ForecastResponse` gains `daily_balances: list[DailyBalance]`, `DailyBalance = {date: date, balance: Decimal}`, one entry per day in `[calculation_date, window_end_date]` inclusive. Computed by walking day-by-day from `current_balance`, applying each day's occurring rules — reuses the existing `_occurrences_in_window`/`_clamped_occurrence` helpers so there is exactly one occurrence-calculation implementation inside Python (the TypeScript simulator engine is a separate, deliberate reimplementation for a different purpose — see below, not a second Python-side copy). `forecast_balance` keeps its current meaning (last point's value) — no breaking change to existing consumers.

New pytest cases: daily series has the correct length, dates are strictly ordered, a two-occurrence-in-window rule (the existing month-boundary edge case) shows up mid-series, not just reflected in the final total.

`web/lib/analytics.ts`: `Forecast` type gains `dailyBalances: {date: string; balance: string}[]`.

### Shared `ForecastChart` component

`web/components/ForecastChart.tsx`, `mode: 'line' | 'weeks' | 'calendar'`:

- **Line**: Recharts `LineChart`. Solid lime line for any elapsed/actual portion (currently always empty since the series starts today — kept for future use, e.g. once historical actuals are plotted), dashed lime for the projected portion, 14%-opacity area fill under it, dashed "Today" reference line, solid "Low" reference line at the minimum point. Axis labels rendered as plain HTML via Recharts' custom-tick support, matching the design's "not SVG text" requirement for crisp rendering.
- **Weeks**: hand-built, not a Recharts shape. Groups `dailyBalances` into 5 week buckets, computes in/out totals per bucket from the recurring rules occurring within it, renders a mini bar-pair + date range + end-of-week balance per bucket.
- **Calendar**: hand-built 16-column day-cell grid, cell shade/height normalized against the series' min/max, minimum day gets a red-accent marker, a row of "rule day" cards below cross-references which recurring rule lands on which date.
- **Overlay** (simulator-only extension): Line mode accepts an optional `afterSeries` prop — base series renders dashed/muted, after-purchase series renders solid lime, with a vertical marker at the new minimum.

### `/forecast` page

3-way segmented control switches `ForecastChart` mode. 3 KPI cards: balance at day 30, lowest projected balance + its date (both derived client-side from `dailyBalances` — no new backend fields needed for min/argmin). Recurring-rules table (reuses `getMyRecurringRules`). Assumptions card renders `forecast.assumptions`, `formulaVersion`, `calculationDate` — all already returned today, no backend change needed for this part.

Overview's forecast card renders the same `ForecastChart` in `'line'` mode, smaller, from the same `getForecast` call Overview already makes in its `Promise.all` — no duplicate request within one page render. `/forecast` as a separate route makes its own independent fetch, which is expected (separate page load).

### Simulator

`web/lib/simulator.ts` (no `server-only` — pure client-side computation, no secrets involved): reimplements `_clamped_occurrence`/`_occurrences_in_window`-equivalent logic in TypeScript against `RecurringRule[]`, `currentBalance`, and `purchaseAmount` (purchase assumed to happen today — the design has no purchase-date field). Produces two day-by-day series: base (no purchase) and after (purchase amount subtracted from every day from today onward). Own Vitest suite mirroring the Python edge cases (two-occurrence-in-window, month-boundary clamp) plus verdict-threshold boundary tests (exactly 0%, exactly 10%, negative balance).

`web/app/simulator/page.tsx`: amount input + range slider (synced state), 4 preset amount chips, optional freetext "what are you buying" field (display-only, not persisted or sent anywhere — no backend field exists for it). Every change recomputes client-side via `simulator.ts` directly — no network round-trip per keystroke. Verdict banner colored per the threshold rule above. 3-way segmented control: *side-by-side* (two stat-row sub-cards, base vs. after), *deltas* (4-column table, colored by sign), *overlaid* (`ForecastChart` line mode with `afterSeries`).

Overview's simulator card: same `simulator.ts` engine, condensed UI (amount input + slider + 2 stat chips + verdict text + CTA linking to `/simulator`, carrying the current amount via query param).

### Login/signup reskin

`web/app/login` and `web/app/signup` CSS modules restyled to the same token set — form fields, buttons, layout. No logic changes to either page or their Server Actions.

## Error handling

- Every page that fetches `getForecast` (Overview, `/forecast`, `/simulator`) wraps it in its own `try/catch`, matching Overview's existing pattern — Analytics Service unavailability degrades only that page's forecast/chart/simulator section, never blocks balance/accounts/transactions rendering, never renders a fabricated 0 (standing brief §11 rule 6, re-verified per route since each is now independently gated rather than sharing one page's error state).
- Accounts page "% of total" guards the zero-total-balance case explicitly — returns an "unavailable" state, not `NaN%` or a silently wrong `0%`.
- Simulator's verdict logic has no undefined state: every `minimumAfter` value maps to exactly one of No/Tight/Yes via the single threshold constant.

## Testing

- `simulator.ts`: occurrence/clamp logic (mirrors Python edge cases) + verdict threshold boundaries (exactly 0%, exactly 10%, negative).
- `analytics-service/forecast.py`: daily-series length, date ordering, two-occurrence-mid-series case (pytest).
- `ForecastChart`: each mode renders the correct point/week-bucket/calendar-cell count for a given `dailyBalances` fixture (Vitest + RTL, structural assertions, no visual snapshotting).
- `TransactionForm` modal: open/close state; existing Server Action wiring is untouched and not re-tested.
- Transactions filter bar: search + category chips + density control narrow the visible row set correctly — filtering logic extracted as a pure function and unit-tested directly, not only through RTL interaction.
- Accounts page: "% of total" calculation, including the zero-total edge case (brief §11 rule 6).
- `Sidebar`: disabled items render non-interactive (no `href`, no navigation triggered on click).
- `proxy`/`authorized` matcher: extended coverage for `/transactions` and `/accounts` (new protected routes); `/forecast`/`/simulator` covered once those routes exist in stories 10/12.

No retroactive test-writing for code this epic doesn't touch.

## Process

Jira: epic(s)/stories broken out and tracked as usual, Claude-guided, following the same pattern as Sprints 1-7. Given the scope confirmed in this spec, sprint length and whether to split into sub-epics is decided at the writing-plans/Jira stage, not fixed here.

## Out of scope (this epic)

Settings screen, CSV import, essential-spend-based verdict thresholds (placeholder percentage rule used instead, swapped later), purchase-date field in the Simulator (purchase always assumed today), historical actual-balance plotting on the chart (Line mode's "actual" segment is structurally supported but always empty for now).

# Design: Settings + CSV Import (sub-project 5, roadmap stage 7)

## Context

Sprint 6 decomposed the dark/lime UI handoff into 5 sequential sub-projects. Sub-projects 1-4 (technical foundation, visual reskin, Simulator, Forecast) shipped as Epic 8, sequential Stories 1-11. Sub-project 5 (Settings + CSV import) was explicitly out of scope for Epic 8 — this spec covers it, as Epic 11.

During brainstorming, the user chose to keep this as one epic with sequential stories (same pattern as Epic 8), rather than splitting Settings and CSV import into two separate epics.

CSV import is also roadmap stage 7 (brief §19) — the last unbuilt MVP stage before demo/CI/CD (stage 8).

## Decisions (confirmed with user before writing this spec)

- **Profile card**: scoped down from the design handoff's "name/email/currency" to email (readonly) + RON currency note only. No `displayName` field added — `users` table has no name column today, and nothing else in the app would consume it. YAGNI.
- **Forecast assumptions — all three fields become functionally real**, not stored-only placeholders:
  - `essentialSpend`: replaces the provisional 10%-of-balance Simulator verdict threshold when set. Falls back to the existing 10% rule when unset (no behavior change for users who don't touch Settings).
  - `payday`: anchors the forecast/simulator window to `[today, next payday)` when set.
  - `horizonDays`: fallback window length (default 30, matching the current fixed behavior) when `payday` is unset.
  - **Precedence**: payday wins when set; horizonDays is the fallback, not a simultaneous cap. (Considered "min(next payday, today+horizonDays)" and rejected — doubles the window-computation logic at every call site for no clear benefit.)
  - This revises the "sold estimat" formula documented in CLAUDE.md (agreed 2026-09-08) from a fixed `[today, today+30)` window to a window computed from user settings, defaulting to the same `[today, today+30)` when Settings are untouched. The formula's own rules (no fabricated values, transfers excluded, explicit assumptions shown) are unchanged — only the window boundary becomes configurable.
- **Data card — both actions real**, not placeholders:
  - Export: CSV download of the user's transactions across all accounts.
  - Delete account: real cascade delete, gated behind password re-entry (server-verified), not just a UI confirmation dialog.
- **CSV import format**: targets Revolut's real personal-account statement export (not a self-invented generic format), researched via web search since no MCP/context7 source covers bank export formats:
  - Columns, in order: `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`.
  - `Completed Date` format: `YYYY-MM-DD HH:MM:SS`.
  - `State`: only `COMPLETED` rows are imported; `PENDING`/`REVERTED`/`DECLINED` etc. are skipped (shown in the preview as skipped, with reason).
  - `Type` values (`TRANSFER`, `CARD_PAYMENT`, `TOPUP`, `ATM`, `EXCHANGE`, `FEE`, ...) are stored verbatim as the transaction's freeform `category` — no new schema needed, `category` is already an optional string.
  - `Amount` sign maps directly to `income`/`expense` — a Revolut `TRANSFER` row is imported as a plain income/expense, **not** modeled as Saldovio's `transfer` type. A `transfer`-type transaction in this schema has no paired destination-account row; inventing that pairing for an external transfer (to an account Saldovio doesn't track) would misrepresent it. This is a deliberate scope boundary, not an oversight.
- **Dedupe (brief §11 rule 3 — repeated import of the same file)**: a hash computed from `Completed Date + Description + Amount + Currency + Balance` (all fields taken verbatim from the file) is stored per imported transaction. Re-importing the same file produces the same hashes; matching rows are flagged as duplicates in the preview and skipped on commit. This is an internal dedupe fingerprint, not presented as or confused with a real bank transaction ID — satisfies "never invent bank identifiers."
- **Analytics Service simplification**: `ForecastRequest` gains `window_end_date` as a required input field, replacing the internal `FORECAST_WINDOW_DAYS = 30` constant. The service becomes a purer calculator — it no longer owns any notion of "30 days," only "the window I was told to compute." `web` becomes the single owner of window-boundary logic (`web/lib/forecast-window.ts`), used by both the Analytics Service caller and `web/lib/simulator.ts` (which keeps its independently-reimplemented occurrence math per Epic 8's Story 11 decision — only the window *boundary* is now shared, not the occurrence calculation itself).

## Architecture

### Epic breakdown (sequential stories)

1. Schema (Settings fields + `importHash`) + Settings API (`GET`/`PATCH /users/me/settings`) + `forecast-window.ts` + Analytics Service `window_end_date`
2. `/settings` UI (Profile + Forecast assumptions cards) + Sidebar link enabled
3. Simulator wiring — essential-spend verdict threshold + payday/horizon window boundary
4. CSV import backend (Revolut parser, `/transactions/import/preview`+`/commit`, dedupe hash)
5. CSV import UI (Settings Data card modal) + Export + Delete account

### Schema (new Prisma migration)

- `User`: `+essentialSpend Decimal? @db.Decimal(14,2)` (matches `Account.currentBalance`/`Transaction.amount`'s money convention — `NUMERIC`, not an integer-bani field, which this schema has never used), `+payday Int?` (1-31), `+horizonDays Int @default(30)`.
- `Transaction`: `+importHash String?`, `@@unique([accountId, importHash])` — null for manually-entered transactions, set only for CSV-imported ones.

### New modules

- `web/lib/forecast-window.ts` — `computeWindowEnd(today, payday, horizonDays): string`. Pure function, single source of truth for window boundary, consumed by both the Analytics Service call site and the Simulator page/card. `payday` clamps to the month's last real day when it exceeds it (same nonexistent-day convention as `RecurringRule.dayOfMonth`, e.g. `payday=31` in a 30-day month → the 30th).
- `analytics-service`: `ForecastRequest.window_end_date: date` replaces the internal constant; `compute_forecast` takes the window end as a parameter instead of deriving it.
- `web/lib/simulator.ts`: verdict threshold logic gains the `essentialSpend`-based branch (falls back to the existing 10% rule).

### Finance API — new endpoints

- `GET /users/me/settings`, `PATCH /users/me/settings` — Zod-validated (`payday` 1-31, `horizonDays` positive int, `essentialSpend` non-negative).
- `POST /transactions/import/preview` — multipart CSV + `accountId`. Parses, filters to `State=COMPLETED`, computes per-row hash, flags duplicates (hash already in DB) and parse errors (malformed rows, with reason). Writes nothing.
- `POST /transactions/import/commit` — takes the (user-confirmed, deduped-in-preview) row set + `accountId`. Inserts atomically (`$transaction`), re-checking hashes at commit time (race-safe against a duplicate import started concurrently or between preview and commit).
- `GET /transactions/export` — CSV of all the caller's transactions across accounts (`date,account,type,amount,category`).
- `DELETE /users/me` — requires current password in the request body, re-verified server-side (mirrors `POST /auth/login`'s check). Cascade delete (`recurring_rules` → `transactions` → `accounts` → `user`) inside one `$transaction`.

### UI

- `/settings` page, inside the `(dashboard)` route group from the start (avoids the `/accounts/new`-style sidebar-missing gap seen twice already in Epic 8).
- Three cards: Profile (email readonly, RON note), Forecast assumptions (payday/essential-spend/horizon form, `PATCH` on save), Data (Export button, Import CSV button opening a modal with a preview table — parsed rows, duplicate/error flags, per-row checkboxes — and a Delete account section requiring password re-entry).
- Sidebar's "Settings" nav item flips from disabled to a real link (matching the Forecast/Simulator pattern from Epic 8 Stories 10-11).

## Testing

- `forecast-window.ts`: unit tests for both branches (payday set this-month/next-month/clamped-to-last-day; payday unset → horizon fallback); this is new date-window logic and gets the same scrutiny prior recurrence/window code has had (Sprint 6, Epic 8 Story 8-9).
- Analytics Service: existing 16 tests updated for the new required `window_end_date` field; no change to the occurrence/clamping logic itself.
- CSV parsing: unit tests on the Revolut column parser — valid rows, non-`COMPLETED` rows skipped, malformed rows produce a clear error, duplicate-hash detection.
- Import commit: atomicity test (a forced failure mid-batch leaves no partial import — same pattern as the Sprint 7 Prisma migration's rollback test).
- Negative-path: `DELETE /users/me` with wrong password → 401, no deletion. Settings `PATCH` without auth → 401. Import endpoints scoped to the caller's own account (403 on someone else's `accountId`, same as `POST /transactions`).

## Out of scope

- Demo-data toggle (mockup's Data card item) — no separate demo-data concept exists in this app.
- Any bank format other than Revolut.
- Editing/undoing a committed CSV import (a bad import is fixed by manually deleting the affected transactions — no bulk-undo feature).
- Changing `Transaction.type` to properly model cross-account transfers detected from CSV — noted as a real gap (a Revolut `TRANSFER` between two of the user's *own* Saldovio-tracked accounts, imported from both sides, would double-count under §11 rule 1) but out of scope: fixing it needs either paired transfer rows or CSV-side account-matching heuristics, neither justified until real usage shows it matters.

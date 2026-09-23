# Saldovio — Epic/Sprint/Backlog breakdown (post-improvements.md)

Date: 2026-09-23
Source: `improvements.md` (S00-S15) as revised by `docs/validation/2026-09-23-improvements-validation.md` (V2).
Epic numbering continues from Jira (last used: Epic 12, CI/CD). Sprint cadence: 1-2 weeks, ~20h/week, matching prior project velocity.

Convention: one Epic per `improvements.md` phase (or merged phases where V2 found a sequencing conflict). Each Epic opens with a brainstorming pass (per CLAUDE.md §13) before its stories are cut. Story count per sprint stays small — same "don't introduce too many new tools at once" rule as every prior epic.

## Leftover cleanup (fold into Epic 13, not its own epic)

S00/S01 are mostly done already (V2 §2). Remaining scraps, cheap, do first:
- Python dependency pinning (`analytics-service/requirements.txt`)
- Secret scanning in CI
- Branch protection on `main`
- Deterministic seed data + injectable clock (S00.4, S00.7) — needed once S03 starts writing balance tests against fixed dates
- Demo seed isolated from test/real data (S00.10)

---

## EPIC 13 — Financial contracts (S02)

No code. Docs + ADRs only. Unblocks everything after it.

**Sprint 1 (1 week):**
- Story 1: `docs/financial-rules.md` — monetary transport (decimal string / bounded minor units), transaction sign convention, dates/timezone rule, rounding/allocation rule.
- Story 2: **ADR — F09/S08 decision** (blocking, brainstorm with user first: keep 4 engines + cross-check test, vs. consolidate into Analytics — see V2 §1).
- Story 3: ADR — opening balance / reference-date convention for migration (legacy inclusive vs. new start-of-day accounts).
- Story 4: ADR — projection interval, reserve-vs-budget definitions, total-assets-vs-spendable-scope.
- Story 5: target-model doc (entities table from `improvements.md` §6) — what's being added incrementally, not a migration-ready schema yet.
- Cleanup story: fold in the S00/S01 leftovers above.

Acceptance: worked examples resolve every rule (per improvements.md §6), ADRs merged, F09/S08 decision recorded before any S08 code is touched.

---

## EPIC 14 — Correct balances & onboarding foundations (S03)

Closes F01, F02. First real code since the hardening pass started.

**Sprint 1:**
- Story 1: regression tests first (TDD) — new-user same-day income/expense, legacy inclusive snapshot unchanged. Uses V1's failing repro tests (F01/F02) as the red bar.
- Story 2: mark auto-created zero account "unconfigured" instead of presenting it as real.
- Story 3: opening-boundary semantics + upper calculation-date bound on current-balance queries; exclude voided/planned.

**Sprint 2:**
- Story 4: backdated-entry preview (show effect before saving/importing past-dated entries).
- Story 5: block future-dated actual transactions; explicit "planned" alternative; review existing future rows.
- Story 6: account name/purpose edit, protected-savings flag, archive/unarchive.
- Story 7: opening-balance correction routed through previewed reconciliation flow.

Acceptance: the three worked examples in `improvements.md` §7 all hold; D01-D03 pass.

---

## EPIC 15 — Auth & security hardening, part 1 (S04, F11 slice)

V2's recommended 3rd sprint of the first slice. Only F11's four sub-findings — rest of S04 deferred to Epic 24 (pre-beta hardening).

**Sprint 1:**
- Story 1: startup validation for required secrets/env; missing secret blocks boot.
- Story 2: internal JWT hardening — explicit alg/issuer/audience/expiry/subject checks, reject malformed/deleted-user subjects.
- Story 3: session revocation (session-version claim), invalidated on password change/delete/logout-all.

**Sprint 2:**
- Story 4: rate limiting on login/signup/recovery/import/forecast routes, shared/durable store, trusted-proxy IP handling.
- Story 5: idempotency keys for manual financial mutations (transactions, transfers) — scoped to user+operation, payload fingerprint.

Acceptance: D22, D23, D26 pass. This closes V2's proposed "first 3-sprint slice" (Epic 13 → 14 → 15).

---

## EPIC 16 — Transactions, transfers & import correctness (S05+S06 merged)

V2 §5: F05 (transfer import) and F06 (description field) need the *same* migration — do them together, not one phase apart as improvements.md originally split them. Also closes F04, F18.

**Sprint 1 — schema + core transaction editing:**
- Story 1: one migration — `Transaction.description`, transfer as its own type, source/lifecycle/version fields.
- Story 2: edit/void/restore transactions with impact preview for matched/reconciled rows.
- Story 3: atomic internal transfers (linked source/destination legs, all-or-nothing commit).

**Sprint 2 — import correctness:**
- Story 4: CSV currency validation — reject/skip non-RON rows explicitly (F04).
- Story 5: import transfer classification — don't assume every positive amount is income (F05); suggest internal-pair matches.
- Story 6: server-staged import preview/commit — replace client-trusted hash/amount with server-owned batch + row IDs (F18).
- Story 7: preserve merchant description + bank operation type through import (F06).

**Sprint 3 — export hardening + polish:**
- Story 8: CSV export formula-injection guard + BOM check (F16 — charset claim already correct per V2 §3, only BOM needs verifying).
- Story 9: categories (standard + user-owned), recategorization, categorization rules.
- Story 10: batch history / undo-import.

Acceptance: D07-D11, D24, D25 pass; a 500 RON transfer preserves consolidated total under injected mid-transfer failure.

---

## EPIC 17 — Obligations & recurring payment matching (S07)

**Sprint 1:**
- Story 1: rule versioning — start/end dates, pause/resume/archive, weekly/annual frequencies (currently monthly-only).
- Story 2: materialize occurrences with stable identities; rule edits touch future-unpaid only.

**Sprint 2:**
- Story 3: occurrence states (planned/partial/paid/overdue/postponed/skipped).
- Story 4: payment matching — link transaction↔occurrence, partial allocation, over-allocation guard.
- Story 5: "mark paid" atomic link-or-create; never silently hides a forecast expense.

**Sprint 3:**
- Story 6: match suggestions (account/type/amount/date proximity), never auto-confirmed.
- Story 7: overdue handling in projection start; bills calendar/list UI.

Acceptance: D04-D06 pass — this is F03's fix, the original "paid twice" bug.

---

## EPIC 18 — One authoritative forecast/simulation engine (S08, consolidation variant)

Scope locked by `docs/adr/0001-authoritative-forecast-engine.md` (Epic 13 Story 2, decided 2026-09-23): **consolidate into Analytics**, not the keep-4-engines default V2 assumed. Reverses Epic 8 Story 11's cross-check-duplication decision. `web/lib/forecast-window.ts` stays as-is (request-shaping, not arithmetic).

**Sprint 1 — contract + Analytics-side correctness:**
- Story 1: extend Analytics contract — request gains explicit dated cash events, calculation date, scope-bound starting balance (total-assets vs. spendable-cash, S08.8), nullable reserve, bounded window; response gains starting availability, min balance + date, end balance, event explanations, formula version, calc timestamp, input-completeness flag (S08.1/S08.4). Validate both shapes at the boundary.
- Story 2: S08.3 permanent fixture-based test suite in Analytics — hand-computed expected outputs for known synthetic inputs, the standing replacement for the old 3-engine cross-check.
- Story 3: S08.6/S08.7 semantics — response explicitly notes daily aggregation doesn't prove intraday ordering on same-day events; reserve/essential-spend unavailable or invalid returns an explicit unavailable/incomplete state, never a silent fallback to the 10%-of-balance rule.

**Sprint 2 — Web migration + rollout:**
- Story 4: retire `web/lib/simulator.ts` — a purchase becomes one more dated cash event in the Analytics request; rewire `SimulatorPanel`/`SimulatorCard` to call Analytics for the verdict instead of computing it locally.
- Story 5: retire `web/lib/forecast-occurrences.ts` — `ForecastChart`'s Weeks/Calendar modes consume Analytics' per-day event explanations instead of re-deriving occurrences from raw recurring rules.
- Story 6: verdict-UI change for S08.7 — Simulator shows an explicit "set essential spend in Settings for a confident verdict" state instead of the retiring `thresholdBasis: balance-percent` fallback display.
- Story 7: S08.9 rollout gate — compare retiring Web logic against the new Analytics contract on synthetic + sanitized real fixtures, classify differences as intentional (S08.7's verdict change) or bug, only delete `simulator.ts`/`forecast-occurrences.ts` once verified.

Acceptance: S08.3 fixture suite passes in Analytics; S08.9 rollout comparison shows only intentional diffs before deletion; `web/lib/simulator.ts` and `web/lib/forecast-occurrences.ts` are gone from the tree; Simulator shows the explicit unavailable state when essential spend is unset; Analytics downtime still leaves transaction CRUD available (already proven in Sprint 6).

---

## EPIC 19 — Variable budgets, reserve, spendable amount (S09)

**Sprint 1:**
- Story 1: split reserve (min retained) from variable-spend budget; migrate old `essentialSpend` setting with explanatory notice.
- Story 2: weekly/monthly category budgets + simple overall option.

**Sprint 2:**
- Story 3: remaining-budget allocation over remaining days (exact minor units, documented remainder rule).
- Story 4: spendable-amount calculation (min projected spendable − reserve, bounded by cash now); completeness checklist.
- Story 5: replace unconditional "affordable" wording with conditional result + missing-items explanation.

Post-MVP, same epic later: Story 6 (opt-in history-based budget suggestion, S09.8 — needs real usage history first).

Acceptance: worked oracle in `improvements.md` §13 resolves exactly; D17-D19 pass.

---

## EPIC 20 — Reconciliation & data freshness (S10)

**Sprint 1:**
- Story 1: record observed balance + effective date; compute difference against app balance.
- Story 2: resolution flow (correct entry / complete transfer / adjustment) with preview.
- Story 3: reconciliation history; invalidate on later edits to covered transactions; freshness indicators on dashboard.

Acceptance: D28 passes exactly (2,510 vs 2,430 → explained -80 adjustment).

---

## EPIC 21 — Purchase scenarios (S11)

**Sprint 1:**
- Story 1: purchase date + paying account (apply from chosen date, not always today).
- Story 2: now/after-payday/custom-date comparison over one horizon; explicit horizon extension if purchase falls outside it.
- Story 3: debounce + stale-response cancellation for slider input.

Post-MVP (V2 §4 — not beta-blocking): Story 4 (recurring ownership costs), Story 5 (saved named scenarios).

Acceptance: D20 passes; a next-week purchase changes only balances from that date onward.

---

## EPIC 22 — Onboarding, dashboard, mobile, accessibility (S12)

**Sprint 1 — onboarding:**
- Story 1: resumable onboarding flow (account, payday, bills, budget, reserve, review) — no duplicate accounts/rules on retry.
- Story 2: dashboard reorder around spendable amount / lowest-balance date / next obligations / freshness.

**Sprint 2 — i18n + filters:**
- Story 3: Romanian user-facing copy, consistent RON/date formatting, translation structure.
- Story 4: transaction filters (account/date/category/type/source/lifecycle) + search, persisted in URL.

**Sprint 3 — mobile + a11y:**
- Story 5: mobile nav (replace fixed sidebar), verified at 320/375/768/1280px.
- Story 6: keyboard/focus/contrast/screen-reader pass on core flows; accessible chart alternatives.

Acceptance: a new user configures one account + gets a real forecast with no external help; core flows work on a narrow phone + keyboard only.

---

## EPIC 23 — Performance, resilience, observability (S13)

**Sprint 1:**
- Story 1: cursor pagination + server-side filters, bounded page size.
- Story 2: per-hop request deadlines, bounded retries, distinguish validation/auth/unavailable/unknown-write-outcome.
- Story 3: independent panel loading (slow Analytics never blocks transaction shell — already partly proven, formalize with deadlines).

**Sprint 2:**
- Story 4: request/correlation IDs, structured redacted logs, health checks, core metrics.
- Story 5: measure query plans at 1k/10k/100k synthetic rows; add justified indexes only.

Acceptance: D29 passes; p95 targets from `improvements.md` §17 measured and recorded (not asserted).

---

## EPIC 24 — Recovery, privacy, deployment, remaining S04, docs (S14 + S04 remainder)

Rest of S04 (password reset, email verification, CSRF/headers/CSP, CORS lockdown) folds in here since it's pre-beta/pre-deployment hardening, same as backup/restore/privacy.

**Sprint 1 — auth completion:**
- Story 1: password change + recovery (hashed single-use tokens, rate-limited, atomic consumption).
- Story 2: email verification.
- Story 3: CSRF/origin validation for Server Actions, security headers, CSP (report-only first), CORS lockdown on Finance API.

**Sprint 2 — recovery & deployment:**
- Story 4: automated encrypted backups + restore drill (record time, checksums).
- Story 5: complete export + account deletion across all new entities.
- Story 6: environment config hardening (no hardcoded URLs), deployment manifests, runbook.
- Story 7: README rewrite, ADR set completed, data-flow diagram.

Acceptance: D21-D23, D27, D31, D32 pass; clean-machine setup guide works; restore meets the 24h/4h target.

---

## EPIC 25 — Full regression, security gate, invited beta (S15)

**Sprint 1:**
- Story 1: browser E2E across disposable services (signup → onboarding → transactions → import → reconciliation → simulation → export → recovery → deletion).
- Story 2: full A/B cross-user authorization sweep; fault injection (D-matrix, all 32 cases).

**Sprint 2:**
- Story 3: close remaining P0/blocking P1; document non-blocking limitations with owner.
- Story 4: invited pilot (5-10 users), one salary cycle, feedback-driven fixes.

Acceptance: `improvements.md` §22's full release checklist passes; this is the real-data-beta gate.

---

## MVP-blocking floor vs. post-MVP (per V2 §4)

**Blocking real-data beta:** Epics 13, 14, 15, 16, 17, 18 (cross-check variant), 19 (minus Story 6), 20, 21 (minus Stories 4-5), most of 22-25.

**Explicitly post-MVP, don't let them gate beta:** S09.8 (budget history suggestions), S11.4/S11.5 (recurring ownership costs, saved scenarios), S15.8-S15.10 (pilot + product metrics — by definition after the gate).

## Sequencing summary

13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25

Each epic opens with a brainstorming session before its first sprint's stories are finalized — same process as every epic since Epic 3.

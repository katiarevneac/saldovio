# Saldovio — CLAUDE.md

Operational guide for Claude Code sessions on this project. Full context, rationale, and open questions live in `Saldovio-Project-Brief.md` — read that first if this file is insufficient. That file predates the rename and refers to the product as "FinPilot" throughout; the current name is **Saldovio**. This file is the distilled, load-bearing subset: decisions already made, rules that must not be silently reversed, and the current state of work.

## What this project is

Saldovio (formerly named FinPilot during early planning): a personal finance SaaS, built incrementally as both a real, usable product and a learning vehicle (software development, architecture, databases, Git, Engineering Management, Product Ownership, Agile/Scrum with Jira/Confluence). The user is a beginner in web development with an engineering-management background in automotive software. Do not generate the whole app at once. Do not skip the teaching cycle for a shortcut.

## Non-negotiable decisions

- **Architecture:** three independently deployable components — Web (Next.js), Finance API (NestJS), Analytics Service (Python/FastAPI). Do not collapse this into a Next.js monolith and do not move financial logic into Next.js for convenience. If a change to this is proposed, it must be explained and discussed with the user first, never applied silently.
- Browser never talks to PostgreSQL directly. Finance API owns authorization and all writes/reads to the database.
- Analytics Service does not touch the database initially and does not block core transaction management if it's unavailable — an unavailable forecast must never render as zero.
- Money is stored as precise decimals (PostgreSQL `numeric`), never floats/JS `Number`, for monetary calculations. Precision/scale to be documented when the schema is designed.
- RON only for MVP. No bank integration, no AI/chatbot, no scoring 0–100, no monetization in MVP scope.

## Language rules

- Explanations and lessons in this conversation: Romanian.
- Code, commit messages, tickets, portfolio documentation: English.
- Caveman mode may be active in the session (compressed prose) — this does not change the Romanian/English split above, only the verbosity of explanations.

## Tech stack

**Accepted:**
- TypeScript for Web and Finance API.
- React + Next.js (frontend).
- NestJS (Finance API).
- Python + FastAPI (Analytics Service).
- PostgreSQL.
- Git + GitHub. Docker and GitHub Actions introduced gradually.

**Proposed, not yet locked in** — validate against current official docs via context7 before implementing, do not assume versions from prior conversation:
- Prisma for NestJS data access (after raw SQL exercises).
- Plain CSS before Tailwind; shadcn/ui later if it helps.
- Recharts for charts.
- Vitest (TypeScript logic) and Playwright (browser flows). Test runner for NestJS and for Python not yet chosen.
- Mature auth provider (Auth.js/Clerk were examples, not final picks).
- Hosting not chosen for any component.

**Environment on this machine** (verified 2026-09-08): Node v26.5.0, npm 11.17.0, Git 2.55.0. `gh` CLI not installed. Re-verify versions before relying on them if this note goes stale — do not assume it stays current.

## Mandatory tooling rule

**Always use context7 (`plugin:context7:context7`) to fetch current documentation before using any library, framework, or CLI feature** — Next.js, NestJS, FastAPI, PostgreSQL, Prisma, testing tools, etc. Do not rely on training-data memory for API syntax, config, or setup steps, even for well-known libraries. This applies to every implementation step, not just initial setup.

## Financial correctness rules (from brief §10–11)

1. A transfer between the user's own accounts is not income or expense at the aggregate level — total balance across accounts is unchanged. Model transfers as their own transaction type, not as income-on-B + expense-on-A.
2. A planned/recurring payment and the transaction that confirms it must not both be subtracted.
3. Repeated import of the same CSV file must be handled explicitly; never invent bank identifiers not present in the file.
4. Starting balance and its reference date must be defined so history is never double-counted.
5. Recurrence calendars, period boundaries, and nonexistent calendar days (e.g. day 31 in a 30-day month) need explicit rules and tests.
6. Indicators with a zero denominator or insufficient data return "unavailable/explained," never a fabricated value.
7. Every simulation/forecast result shows its assumptions, relevant inputs, calculation date, and formula version.

### Known limitation — backdated transactions (found 2026-09-09, Sprint 4 S2)

`accounts.current_balance` is a fixed snapshot as of `reference_date` (inclusive). A transaction with `occurred_on <= reference_date`, added *after the fact*, is **not** reflected in the displayed balance — it's assumed already baked into the stored `current_balance`. This is by design (rule 4 above — no double-counting), not a bug, but it means there is currently no way to correctly log a transaction that predates an account's `reference_date`.

Workaround once multi-account support exists (not yet built): a separate account (e.g. "Cash") can have its own earlier `reference_date`, since `reference_date` is per-account. Not a fix for the single-account case.

Not yet surfaced in the UI — a user can currently add a backdated transaction with no warning that it won't affect the balance. Revisit if this causes real confusion (it did once, during Sprint 4 S2 testing).

### Definition — "sold estimat" (agreed 2026-09-08)

```
Sold estimat(azi + 30 zile) =
    Sold curent (suma tuturor conturilor utilizatorului, la data calculului)
  + Σ venituri recurente confirmate în intervalul [azi, azi+30)
  − Σ cheltuieli recurente confirmate în intervalul [azi, azi+30)

Transferuri între conturi proprii: excluse din venit/cheltuială (sold total neafectat).
```

Scope level: all of the user's accounts combined, not per-account.
Limitation (must be visible in UI, not hidden): forecast uses only confirmed recurring rules. One-off irregular past expenses are not statistically extrapolated.
Interval convention: `[azi, azi+30)` — a recurrence landing exactly today is included; one landing exactly at day 30 is not.

## Security rules (from brief §12)

- Authentication and authorization are distinct concepts, taught explicitly, not conflated.
- Server-side ownership checks on every data access — never trust a `userId` sent by the browser.
- Negative-path tests: user A must not be able to read/modify user B's data.
- Idempotency (or equivalent) for repeatable requests — no duplicate financial transactions from retries or double-clicks.
- Atomicity for multi-step writes that must succeed together.
- No secrets or unnecessary financial data in logs.
- Demo/fake data kept separate from real data. Real data only after relevant security/correctness/recovery checks exist.

## Minimal data model (derived so far, not final schema)

| Entity | Key fields | Why |
|---|---|---|
| User | id, email | ownership root |
| Account | id, user_id, name, current_balance, reference_date | sum of accounts = starting balance |
| Transaction | id, account_id, type (income/expense/transfer), amount, date, category | `transfer` as its own type enforces rule §1 above |
| RecurringRule | id, account_id, type, amount, frequency, day_of_month, active | forecast reads recurring rules, not history |

Schema is not finalized — this is the minimum implied by the rules agreed so far. Do not treat it as a migration-ready design.

## Teaching cycle (must follow, per brief §13)

For every stage: 1) user's problem + target outcome, 2) mini-lesson with terms explained from scratch, 3) alternatives + decision with reasoning, 4) a concrete exercise/contribution from the user, 5) small tracked implementation, 6) test + demo, 7) PO/EM reflection.

Rules:
- A feature isn't "learned" just because it works — the user must be able to explain the data path, possible errors, and how it was verified.
- Don't introduce many new tools in one lesson.
- Work step by step; don't dump multiple roadmap stages in one response unless asked.
- Decisions can be challenged and revised with evidence — don't present preferences as universal truth.

## Roadmap stage reference (brief §19, non-binding on dates)

0 Product Brief + backlog → 1 static page w/ fake data + repo → 2 first transaction saved Web+API+DB → 3 per-user auth → 4 correct dashboard → 5 Analytics Service + 30-day forecast → 6 simulator → 7 CSV import → 8 demo/CI/CD → 9 invited beta → later: credit models/monetization.

## Progress log

Update this section at the end of each session: what's confirmed, what was built, what's next. Keep it short — this is a pointer, not a transcript.

- **2026-09-08:** Read full brief. Confirmed architecture/objective. Lesson 1 done (browser/API/DB roles, why browser can't touch DB directly). "Sold estimat" definition agreed (see above). Environment checked: Node v26.5.0, npm 11.17.0, Git 2.55.0, VS Code, GitHub account exists, no `gh` CLI, no repo initialized yet. Data model above is derived, not finalized. Capacity: 20h/week, 1-week sprints. Initial backlog drafted (Epic: static fake-data dashboard page + repo, brief §19 stage 1). Sprint 1 goal proposed: repo on GitHub + static HTML/CSS/JS page with fake balance and transactions, no backend. **Product renamed FinPilot → Saldovio** — brief file renamed to `Saldovio-Project-Brief.md` with a rename note at the top; brief content otherwise left as originally written (still says "FinPilot" throughout, intentionally). Jira site exists: `saldovio.atlassian.net` — mid-setup, creating a Scrum project named "Saldovio". Local repo initialized: `git init`, initial commit `c35ea44` made by the user, default branch renamed `master` → `main`. Jira project **Saldovio** created (Scrum template), site `saldovio.atlassian.net`. Epic `Foundation — repository + fake-data dashboard page` created, linked to both stories: `SAL-2` (Git repository with clear README), `SAL-3` (Dashboard page with fake balance and transactions). Decided to skip separate Task-type issues for this sprint — scope too small to justify the process overhead. Sprint `SAL Sprint 1` started: 1 week, 2026-09-08 to 2026-09-15, goal "Repository on GitHub with README, plus a static HTML/CSS/JS page displaying fake account balance and transactions — no backend yet." SAL-2 done: README + .gitignore committed (`4f04274`), GitHub repo created (`katiarevneac/saldovio`, public), pushed. SAL-3 done: static dashboard built on `feature/SAL-3-static-dashboard` — `prototype/index.html`, `prototype/app.js`, `prototype/styles.css`. Amounts stored as integer minor units (bani), never floats — `formatAmount` divides by 100 only at display time via `Intl.NumberFormat('ro-RO', ...)`. Balance is computed with `.reduce()` over the fake transactions array, not hardcoded. PR #1 opened and merged into `main` (commit `ca5b624`), local branch deleted after merge. Sprint 1 (2026-09-08 to 2026-09-15) goal met with both stories done, ahead of the 1-week deadline. Sprint 1 closed early, retro written (`docs/retro/sprint-1.md` — written by Claude at the user's request, not the user; flagged as a process gap to revisit). **Sprint 2 started** (2 weeks, scope tripled vs. Sprint 1 on the user's call): Epic "Web + API + DB integration — first real transaction saved", broken into 3 sequential stories to avoid introducing too many new tools at once (brief §13) — S1 (PostgreSQL + transactions table), S2 (NestJS POST /transactions endpoint), S3 (dashboard form calls the API for real).

**S1 done:** found an existing Postgres.app 18.x install (not Homebrew) with the server already running — other local databases exist (`helpdesk`, `routewise_dev`) from unrelated projects, left untouched. Added Postgres.app's bin to `~/.zshrc` PATH. Created dedicated dev database `saldovio_dev`. Migration `db/migrations/0001_create_accounts_and_transactions.sql` — `accounts` and `transactions` tables, no `users` table yet (auth is roadmap stage 3). **Money in Postgres uses `NUMERIC(14,2)`, not integer minor units** — different convention from `prototype/app.js`'s integer-bani approach, and deliberately so: `numeric` is exact decimal natively, so Postgres doesn't need the JS workaround. Both solve the same float-precision problem, each with the tool suited to its layer. FK constraint (`transactions.account_id → accounts.id`) verified by hand: an insert with a nonexistent `account_id` was rejected by Postgres itself, not application code — concrete proof of brief §12 ("verificări server-side, integritate impusă, nu doar de aplicație"). Migration committed and pushed (`be5ad0d`).

No separate Task-type Jira issues were created for S1/S2/S3 (same simplification as Sprint 1) — work is tracked at the story level.

**S2 done:** scaffolded `finance-api/` (NestJS 12, native ESM — `"type": "module"` + `nodenext` module resolution, so relative imports need explicit `.js` extensions even in `.ts` source). Vitest and oxlint are the CLI's current defaults, not Jest/ESLint. Added `pg`, `class-validator`, `class-transformer`. `TransactionsModule` (controller + service + DTO) with `POST /transactions`, raw parameterized SQL (no ORM yet — matches the "SQL before Prisma" sequencing), global `ValidationPipe` in `main.ts`. DB connection (`src/database/pool.ts`) relies on `pg`'s built-in env-var/localhost defaults — no `.env` needed for local dev, same convention `psql` already used. **Found and fixed a real bug:** `pg` parses `DATE` columns into JS `Date` objects at local midnight, which serialize to UTC and can shift the displayed date by a day (`2026-09-10` → `"2026-09-09T21:00:00.000Z"`) — the stored value was always correct, only the API's JSON output was wrong. Fixed with `pg.types.setTypeParser(1082, val => val)` to keep DATE columns as raw strings; verified against node-postgres docs via context7 before applying. Endpoint tested via curl: valid POST → 201 + real row in `saldovio_dev`; invalid `type` → 400 from ValidationPipe before hitting application code.

**Process gap surfaced:** S1 and S2 were committed straight to `main`, breaking from the branch → PR → merge flow used for SAL-3 (brief §18) — not caught until after the fact, too late to undo without rewriting history. Decision: resume branch + PR for S3 onward.

**S3 done, on branch + PR as decided.** Added `GET /transactions` (needed for the page to show real data, not just accept writes) and `app.enableCors()` — browser fetch across ports is cross-origin, blocked by default. `prototype/app.js` rewritten: hardcoded fake array removed entirely, page now fetches real rows on load and re-fetches after every successful save (simpler and more honest than optimistic local updates — the page always reflects actual DB state). `toBani()` parses the API's decimal-string amounts (Postgres `numeric`) via string manipulation rather than `parseFloat`, to avoid reintroducing float error on the client. Served `prototype/` via `python3 -m http.server` for testing — `file://` origin is unreliable for `fetch`. PR merged (`48c8762`), branch deleted after merge.

**Sprint 2 complete — all 3 stories (S1, S2, S3) done, well inside the 2-week window.** First real end-to-end flow exists: browser form → NestJS API → PostgreSQL, with a validation layer (DTO + ValidationPipe) and a real bug found and fixed along the way (date timezone round-trip in `pg`'s DATE parsing). Sprint 2 retro written (`docs/retro/sprint-2.md`, same authorship caveat as Sprint 1 — user declined to write it herself again).

**Sprint 3 started** (2 weeks, same cadence as Sprint 2): Epic 3 "Next.js migration + authentication — per-user data isolation". Architecture decision: BFF (Backend-for-Frontend) pattern for auth — browser talks only to Next.js (session cookie, same-origin), Next.js calls Finance API server-to-server with a shared secret asserting the authenticated user, rather than NestJS independently verifying Auth.js's JWT. Chosen because Auth.js is Next.js-native; avoids manual JWT-verification plumbing in NestJS. Auth provider: Auth.js/NextAuth. Broken into 4 sequential stories: S1 (scaffold `web/`, migrate read-only dashboard), S2 (add-transaction form in Next.js), S3 (login/signup with Auth.js), S4 (Finance API requires auth + enforces per-user ownership).

**S1 done, on branch + PR.** Scaffolded `web/` — Next.js 16.3.4, React 19.2.8, TypeScript, App Router, no Tailwind. Read-only dashboard migrated from `prototype/` into an async Server Component (`web/app/page.tsx`) that fetches `GET /transactions` from the Finance API with `cache: "no-store"` (Next.js's current default — no caching unless opted in, verified via context7 and the locally bundled Next.js docs). Money logic ported into `web/lib/money.ts` (`toBani`/`formatAmount`, same string-parsing approach as `prototype/app.js` — no `parseFloat` on the API's decimal strings) and `web/lib/transactions.ts`. Styled via CSS Modules (`web/app/page.module.css`). Verified with `tsc --noEmit` and `eslint` (clean), dev server run on port 3001 (3000 taken by finance-api), confirmed against real API data and visually matched to `prototype/`'s behavior by the user. Committed as two commits (`3d2178e` scaffold, `0ddbdcf` migrate dashboard) on `feature/E3-S1-nextjs-dashboard`, PR #3 opened and merged (`b1a4924`), branch deleted after merge. `prototype/` is now superseded by `web/` and will be retired once `web/` reaches full feature parity — not yet done, kept for now as the S2 reference until the form is ported. **Next:** mark S1 Done in Jira, start S2 (add-transaction form in `web/`, same BFF-less direct-to-Finance-API pattern as S1's read, matching brief §12 negative-path/ownership rules once auth lands in S3-S4).

**S2 done, on branch + PR.** Added `web/components/TransactionForm.tsx` — Client Component (`"use client"`), controlled inputs for type/amount/date/category, sign derived from `type` (not typed by the user, same rule as `prototype/app.js`). `createTransaction()` added to `web/lib/transactions.ts`, POSTs to the Finance API with the same payload shape the DTO expects (`accountId` hardcoded to `1` — single-account MVP, no accounts endpoint yet). On success, calls `router.refresh()` (`next/navigation`) — confirmed via context7 that this re-fetches the current route's Server Component tree (re-running `getTransactions()`, which uses `cache: "no-store"`) while preserving Client Component/browser state, distinct from a full page reload. This is why the list/balance update after submit without any client-side optimistic state. Verified: `tsc --noEmit` and `eslint` clean, transaction added via the browser form, appeared in the list, balance updated. PR #4 merged (`1710faf`), branch deleted after merge.

Scale question raised by the user (10M-user hypothetical): confirmed the Server Component + `router.refresh()` pattern is not itself a scaling bottleneck (cost is O(1) per user action, not systemic) — real scale risks live in DB connection pooling, caching, and horizontal API scaling, none of which are MVP concerns yet. The actual near-term issue flagged is security, not scale: hardcoded `accountId`, no auth, no ownership checks — already the explicit target of S3-S4.

**S3 done, on branch + PR.** Migration `db/migrations/0002_create_users.sql` adds a `users` table (`email` UNIQUE, `password_hash`, `created_at`) — authentication identity only, no `user_id` FK on `accounts`/`transactions` yet (that's S4's ownership-enforcement job, deliberately kept separate). `finance-api`: `POST /users` (signup, `bcryptjs` hash, 10 rounds) and `POST /auth/login` (verify email+password; same "Invalid credentials" message whether the email doesn't exist or the password is wrong, so the endpoint doesn't leak which registered emails exist). Both tested via curl: signup 201, duplicate email 409 (caught via Postgres unique-violation error code `23505`), login 200 on success, 401 on wrong password and on unknown email.

`web`: Auth.js v5 (`next-auth@beta`), Credentials provider, `session: { strategy: "jwt" }` — required explicitly because Credentials doesn't support the `"database"` session strategy, confirmed via context7 (`UnsupportedStrategy` error). **Key architecture point:** `authorize()` runs server-side inside `web/`, but per the non-negotiable "Finance API owns all DB access" rule, it does not query Postgres directly — it calls Finance API's own `POST /auth/login` over HTTP, same as any other client would. `AUTH_SECRET` generated locally, stored in `web/.env.local` (gitignored, not committed). `/login` and `/signup` pages use plain `<form action={...}>` Server Actions calling `signIn`/`signOut` from `@/auth` — Auth.js's own documented v5 pattern, no client-side JS or `next-auth/react` needed. Dashboard (`page.tsx`) now shows the signed-in user's email + a logout form when a session exists. **Dashboard is intentionally NOT gated behind login yet** — with no `user_id` column on `accounts`/`transactions`, gating would be cosmetic, not real enforcement; that's explicitly S4.

Learning checks passed: user correctly explained JWT vs database sessions (self-contained signed cookie vs server-side session lookup) and correctly reasoned through why `strategy: "jwt"` is currently redundant (no adapter configured, so it's already the default) but guards against a future `UnsupportedStrategy` break if an OAuth adapter is added later.

**S4 done, on branch + PR — Sprint 3 complete (S1–S4 all done).** Migration `db/migrations/0003_add_user_id_to_accounts.sql`: `accounts.user_id` added nullable, existing dev account backfilled to `test@example.com`, then set `NOT NULL`. `finance-api`: signup (`UsersService.create`) now creates the user + a default "Cont curent" account in a single DB transaction (`BEGIN`/`COMMIT`/`ROLLBACK` via `pool.connect()`, first hands-on use of explicit transactions — brief §12 atomicity) — without this, a new user would have no account to transact against.

**Trust mechanism, decided over the static-secret alternative:** `InternalAuthGuard` (`finance-api/src/auth/internal-auth.guard.ts`) verifies a short-lived (30s) HS256 JWT signed by `web/` with a secret only the two services share (`INTERNAL_API_SECRET`, separate from Auth.js's `AUTH_SECRET`, gitignored in both `web/.env.local` and `finance-api/.env`). The user id lives inside the signed `sub` claim, not a separate spoofable header — chosen over a static-secret-plus-`X-User-Id`-header scheme specifically because a leaked static secret would grant permanent impersonation of any user, while a leaked JWT is only usable for its ~30s remaining lifetime. `GET /accounts/me` and `GET /transactions` scope to the caller's own data (join/filter on `user_id`); `POST /transactions` verifies the target `accountId` actually belongs to the caller before writing, 403 otherwise.

`web`: `lib/internal-auth.ts` signs the token server-side using `jose`, guarded by `import "server-only"` (build fails if ever imported into a Client Component — the secret must never reach the browser bundle). This forced `TransactionForm`'s write off a direct browser→Finance API fetch and onto a Server Action (`web/app/actions.ts`) — the browser can no longer reach Finance API at all; every call is now server-side and signed. `accountId` is no longer hardcoded — `web/lib/accounts.ts` fetches the caller's real account via `GET /accounts/me`.

Verified via a curl negative-path suite: no token → 401, malformed token → 401, forged signature (correctly-shaped JWT signed with the wrong secret) → 401, well-signed token for a nonexistent user id → 200 with an empty list (no error that would leak account existence), cross-user write attempt on another user's account → 403. Signup's atomicity confirmed directly in `psql`. Full browser flow confirmed by the user: a pre-existing user sees their existing data under the new ownership filtering, and a freshly signed-up user gets an account automatically and can add a transaction visible only in their own list.

Learning checks passed: user correctly reasoned that a stolen static shared-secret would allow permanent impersonation (no expiry, `X-User-Id` uncoupled from the secret), self-corrected after an initial answer that conflated the risk with browser-side credential storage (there is none — `server-only` prevents that by construction); also correctly reasoned that a stolen *valid* JWT is fully usable for its remaining ~30s window (not "safe by default"), with the real protection being the short, non-renewable exposure window rather than immunity.

**Sprint 3 complete: S1–S4 all done.** Epic 3 goal met — Next.js migration, Auth.js login/signup, and real per-user ownership enforcement on Finance API, replacing the fully public dev-mode API from Sprint 2. Sprint 3 retro written (`docs/retro/sprint-3.md`), same authorship caveat, now the third sprint in a row with this pattern. Sprint 3 closed, **Sprint 4 started** (1 week, 2026-09-09 → 2026-09-16): Epic "Correct dashboard — accurate balance calculation" (roadmap stage 4). Root cause: `accounts.current_balance`/`reference_date` existed in the schema since Sprint 2 but the dashboard ignored them entirely, just summing all transaction history — a real instance of brief §11 rule 4 (double-counting risk). Two stories: S1 (Finance API computes correct balance), S2 (dashboard displays it).

**S1 done, on branch + PR.** `AccountsService.findMine` now computes `balance = current_balance + SUM(transactions.amount WHERE occurred_on > reference_date)` server-side (Postgres `FILTER` clause), exposed on `GET /accounts/me`. Convention decided with the user: `reference_date` is inclusive in `current_balance` — only strictly-later transactions get added, avoiding double-counting a transaction dated exactly on it. Formula validated directly in `psql` against real data before writing TypeScript. PR #7 merged.

**S2 done.** `web/app/page.tsx` now displays `account.balance` (from `GET /accounts/me`) instead of `reduce()`-ing the full transaction list client-side. **Process note:** this story was initially committed directly to `main` without a branch — the exact mistake Sprint 2's retro flagged and Sprint 3 had avoided throughout. Caught before the commit landed (uncommitted changes moved onto a proper branch via `git checkout -b` before committing), not after — an improvement on how Sprint 2's version of this mistake was caught, but the underlying habit (branch first, always) still needs reinforcing rather than assumed.

**Real limitation surfaced during S2 testing** (see the new "Known limitation — backdated transactions" note under Financial correctness rules above): backdating a transaction to before `reference_date` silently has no effect on the displayed balance. Confirmed as correct-per-design (not a bug) with the user, documented rather than silently left implicit. This also surfaced a genuine backlog item: **multi-account support** (e.g. a separate "Cash" account with its own `reference_date`) is not built — schema already supports multiple accounts per user, but there's no `POST /accounts` endpoint, no account-creation UI, and no account-selection in the transaction form. Not in Sprint 4 scope; noted for a future sprint.

PR #8 merged. **Sprint 4 complete: S1+S2 both done**, dashboard balance now matches the financial model instead of a naive transaction sum.

**Process change (2026-09-09):** user gave direct feedback that end-of-story "explain in your own words" recall checks (brief §13's learning-verification step) aren't helping her — Jira/Scrum practice is the part that's actually landing. Dropped recall-quiz questions going forward; kept mini-lessons/technical explanations and Jira/PM guidance. Saved as a standing feedback memory outside this repo.

Sprint 4 closed. **Sprint 5 started** (1 week, 2026-09-09 → 2026-09-16): Epic "Multi-account support" — resolves the backdated-transaction limitation from Sprint 4 by letting each account carry its own `reference_date`. Scope decided via a brainstorming pass (2 clarifying questions, 2-3 approaches considered): dashboard shows aggregate total **and** a per-account breakdown; account management is create + select only, no edit/delete (YAGNI — deferred until a real need for it shows up). Two stories: S1 (Finance API `POST /accounts`), S2 (web: selector + creation page + dashboard breakdown).

**S1 done.** `AccountsService.create()` inserts a new account owned by the caller; `POST /accounts` reuses the existing `InternalAuthGuard` (no new auth code needed — same guard already covers every `/accounts` route). Verified via curl: create → 201, appears in `GET /accounts/me`; no token → 401. PR #9 merged.

**S2 done.** `getMyAccount()` → `getMyAccounts()` (full list, no longer just the first). `TransactionForm` now takes an `accounts` prop and a real `<select>` instead of an implicit first-account pick; `createTransactionAction` takes `accountId` from the form. New `/accounts/new` page + `createAccountAction`, mirroring the `/signup` Server Action pattern. Dashboard: total balance = sum of all accounts' `balance` fields (still integer-bani arithmetic, no floats); new "Accounts" section lists each account with its own balance. Verified end-to-end in the browser: created a "Cash" account with an earlier `reference_date`, added a transaction dated in that account's past — correctly reflected in both its own balance and the aggregate total, confirming the Sprint 4 limitation is resolved for accounts that opt into it. PR #10 merged.

**Sprint 5 complete: S1+S2 both done**, well inside the 1-week window. Found (not touched, out of scope): an untracked `design_handoff_saldovio_dashboard/` directory appeared in the repo root during S2 — a design-tool export, not created by this session's work; flagged to the user rather than silently added to or ignored by git.

Sprint 5 closed. **Sprint 6 started** (2 weeks, 2026-09-09 → 2026-09-23): Epic "30-day balance forecast — Analytics Service", roadmap stage 5. User chose one combined sprint over splitting schema-work from the Analytics Service itself (considered and explicitly declined the 2-sprint split this session recommended). Four stories: S1 (`RecurringRule` schema + Finance API CRUD), S2 (recurring-rule creation UI), S3 (Analytics Service, FastAPI, `/forecast`), S4 (dashboard forecast display with graceful fallback).

**Data-flow decision (brainstormed with the user):** `web/` collects balance + recurring rules from Finance API and sends them to Analytics Service as input — Analytics Service does not call Finance API itself. Chosen over the alternative (Analytics Service calling Finance API directly) specifically to avoid spreading `INTERNAL_API_SECRET` to a third service and to keep Analytics Service a pure, dependency-free calculator matching the standing rule that its unavailability must never affect core transaction management.

**Schema decision:** `recurring_rules.frequency` is `monthly`-only for now (CHECK-enforced) — weekly/daily deferred until a real need surfaces. Nonexistent-day handling (`day_of_month` 31 in a 30-day month) clamps to the month's last day — decided with the user, will be implemented in S3's forecast computation, not at the storage layer.

**S1 done.** `db/migrations/0004_create_recurring_rules.sql` — table only stores the rule; no forecast logic lives here. `POST`/`GET /recurring-rules` mirror the transactions pattern exactly (ownership check on create, `JOIN accounts` scoping on read), reusing `InternalAuthGuard` unchanged. Verified via curl: create → 201, invalid `dayOfMonth` (32) → 400 from `ValidationPipe` before reaching application code, no token → 401.

**Process change (2026-09-09):** user asked Claude to create and merge PRs directly via `gh` CLI going forward, instead of handing off title/description for her to action on GitHub. Installed `gh` via Homebrew, she ran `gh auth login` once. PR #11 (S1) was the first PR created and merged this way — same Why/What/How-verified description convention kept, just automated who clicks merge. Saved as a standing feedback memory outside this repo.

**Next:** mark S1 Done in Jira, start S2 (recurring-rule creation UI in `web/`).

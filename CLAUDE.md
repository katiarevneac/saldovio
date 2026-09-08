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

No separate Task-type Jira issues were created for S1/S2/S3 (same simplification as Sprint 1) — work is tracked at the story level. **Next:** mark S1 Done in Jira, then S2 — minimal NestJS app with a `POST /transactions` endpoint writing to `saldovio_dev`, verified via curl/Postman before any UI involvement.

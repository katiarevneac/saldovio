# Epic 12 — Demo / CI/CD (roadmap stage 8)

Design doc. Predates any implementation plan; see `writing-plans` output for
task-level breakdown.

## Context

Brief §19 lists roadmap stage 8 as one bucket: "demo/CI/CD". This epic keeps
that as one combined epic (per user decision, matching the project's existing
pattern of merging related sub-projects rather than splitting them — e.g.
Sprint 8, Epic 11 Story 2+3).

Repo has 3 independently deployable components (non-negotiable architecture
decision, see CLAUDE.md): `web` (Next.js 16), `finance-api` (NestJS 12 +
Prisma 7 + PostgreSQL), `analytics-service` (Python 3.14 + FastAPI). Tests
exist in all three (Vitest, Vitest, pytest) but there is no CI pipeline and
no hosting/deploy setup yet.

**Repo-state prerequisite:** local `main` is 103 commits ahead of
`origin/main`, 0 behind (confirmed via `git fetch` + `git log
origin/main..main` / `main..origin/main`) — a clean fast-forward, no
divergence, no force push needed. Every story since PR #18 (Sprint 7 S3) has
been merged to `main` locally only. CI-on-PR requires real GitHub PRs to
trigger against, so catching origin up is a prerequisite, not optional
cleanup.

**Explicit scope boundary (user decision, 2026-09-23):** this epic plans and
configures hosting (S3) but does **not** execute the deploy — no accounts
created, nothing made live — until the user explicitly says go in a future
session. S1 and S2 execute normally.

## Decisions

- **One combined epic**, not split into separate CI / demo epics.
- **CI runs on every PR into `main`**: tests + typecheck + lint, per service,
  blocking merge on failure. Not run on direct pushes to `main` (PRs are the
  gate).
- **Deploy trigger (once S3 is later executed): auto-deploy on merge to
  `main`** — native behavior on all three chosen platforms, no extra CI
  config needed to wire it up.
- **Hosting target: Vercel (web) + Render (finance-api + analytics-service)
  + Neon (Postgres)**, chosen after checking current (Sept 2026) free-tier
  terms for Vercel, Render, Railway, Neon, Supabase, Fly.io:
  - Vercel Hobby: free, non-commercial only (fits — portfolio project, no
    MVP monetization per CLAUDE.md), no expiry.
  - Render free web services: never expire, sleep after 15 min idle, ~1 min
    cold-start on wake.
  - **Render's free Postgres was rejected**: expires 30 days after creation
    + 14-day grace, then deleted — not viable for a persistent demo DB.
  - **Neon Postgres**: permanent free tier, no expiry, no credit card, scales
    to zero after 5 min idle (data persists; cold-start on wake) — used
    instead of Render's Postgres specifically to avoid the expiry trap.
  - Railway and Fly.io were ruled out: neither has a standing free tier as
    of Sept 2026 (Railway: one-time $5 credit, 30 days; Fly.io: no free tier
    since Oct 2024, trial capped at 2 VM-hours/7 days).
  - Known accepted tradeoff: three independent free-tier services means
    stacked cold-starts. Vercel's edge is fast; `finance-api` and
    `analytics-service` on Render each wake ~1 min from idle. First hit
    after idle will lag — flagged for the demo's own UI/README, not treated
    as a bug to engineer away on a free tier.
- **CORS on `finance-api` stays wide open** (`app.enableCors()`, no origin
  restriction) — not tightened in this epic. The browser never calls
  `finance-api` directly (BFF pattern since Epic 7 S3/S4: all calls are
  server-to-server from `web`), so this isn't a live exposure today. Recorded
  here as a parked decision, not silently ignored — brief §12 territory,
  worth tightening if the BFF assumption ever changes.

## Architecture / stories

Sequential, matching this project's existing pattern (one story unlocks the
next):

### S1 — Push `main` to `origin/main`

Straightforward `git push origin main`, fast-forward, no force. No other
code changes. Resumes the "PRs via `gh` CLI" workflow (standing preference,
saved as a feedback memory) going forward — S2 and later PR-based work need
this in place first.

### S2 — GitHub Actions CI

New `.github/workflows/ci.yml`, triggered on `pull_request` targeting
`main`. Three independent, parallel jobs — one per service, so a failure in
one doesn't block the others from reporting, and so each job's log stays
scoped to one service (matches this project's "each layer re-verified
independently" pattern rather than one monolithic script):

- **`web`**: `actions/setup-node@…` pinned to Node 26 (matches CLAUDE.md's
  verified local environment; no `engines` field exists anywhere in the repo
  to derive this from, so CI pins explicitly). `npm ci` → `npx tsc --noEmit`
  → `npx eslint .` → `npm test` (`vitest run`).
- **`finance-api`**: same Node setup, plus a `postgres:18` service container
  (matches the locally installed Postgres.app major version) with a health
  check gate before the job proceeds. `npm ci` (runs `prisma generate` via
  the existing `postinstall` script) → `npx prisma migrate deploy` against
  the service container → `npx oxlint src/ test/` → `npm test` (`vitest
  run`, hits the real container DB — matches this project's standing
  no-mocking-the-database convention, now enforced in CI too, not just
  locally).
- **`analytics-service`**: `actions/setup-python@…` pinned to Python 3.14.
  `pip install -r requirements.txt` → `pytest`.

CI failure blocks merge (branch protection on `main` requiring the workflow
to pass — configured as part of this story, not assumed). CI is a gate, not
a repair mechanism: a red run means fix and re-push, no auto-fix loop.

### S3 — Hosting/deploy configuration (config + docs only, not executed)

Produces the configuration and documentation needed to deploy, without
creating any accounts or making anything live:

- **`web` on Vercel**: root directory `web/`, framework auto-detected
  (Next.js). Required env vars documented: `AUTH_SECRET`,
  `INTERNAL_API_SECRET`, `FINANCE_API_URL`, `ANALYTICS_SERVICE_URL`.
- **`finance-api` on Render**: Node web service, root `finance-api/`. Build
  command `npm ci && npm run build`. Pre-deploy command `npx prisma migrate
  deploy` (production migrations, not `migrate dev`). Start command `npm run
  start:prod` (already exists: `node dist/main`). Env vars: `DATABASE_URL`
  (from Neon), `INTERNAL_API_SECRET`, `PORT` (Render-provided).
  - **New health-check endpoint**: `finance-api` currently has no `GET /`
    route (unlike `analytics-service`, which already has one). This story
    adds a trivial one for Render's health check to poll — a real addition,
    not a placeholder.
- **`analytics-service` on Render**: Python web service, root
  `analytics-service/`. Build command `pip install -r requirements.txt`.
  Start command `uvicorn main:app --host 0.0.0.0 --port $PORT`. Reuses the
  existing `GET /` health check. No DB, no secrets (matches its standing
  "pure calculator, no DB, no outbound calls" design).
- **Postgres on Neon**: one free project. Connection string becomes
  `finance-api`'s `DATABASE_URL` on Render.
- **New `docs/deploy.md`**: which secret lives in which service's dashboard,
  how to generate each (`AUTH_SECRET` via `npx auth secret`,
  `INTERNAL_API_SECRET` via `openssl rand -base64 32` — matching the
  existing local `.env`/`.env.local` generation convention), and an explicit
  "never commit" reminder matching the existing `finance-api/.env.example`
  precedent.
- **Deploy trigger**: auto-deploy on merge to `main`, native to all three
  platforms once connected to the GitHub repo — no additional CI/CD glue
  code required for this.

Explicitly **not** done in this story: creating the Vercel/Render/Neon
accounts, connecting the repo, setting real secret values, or triggering a
first deploy. That is a separate, later, explicit user go-ahead.

## Data flow / infra notes

No change to the app's own request flow — `web` still calls `finance-api`
and `analytics-service` server-to-server exactly as today (Epic 7's BFF
pattern), only now over real hostnames instead of `localhost`, with TLS
terminated at each platform's edge rather than in application code.

Neon's scale-to-zero behavior means `finance-api`'s first query after DB
idle may be slower (cold Postgres wake) — Prisma's default connection
handling is expected to absorb this without code changes, but this is
flagged to confirm once S3 is actually executed, not assumed correct ahead
of time.

## Error handling

- CI failures block merge; no auto-remediation.
- Render free-tier cold start (~1 min wake for `finance-api` and
  `analytics-service` after 15 min idle) will surface to a demo visitor as a
  slow first load. This needs a one-line note in the deployed app (or its
  README) once S3 goes live, so it reads as a known free-tier tradeoff
  rather than a broken app — same instinct as the project's standing
  "unavailable forecast must never render as zero" rule: don't let
  infrastructure latency masquerade as failure.

## Testing

- **S2 verifies itself**: after the workflow is added, deliberately break
  one service's test locally, push, and confirm CI actually catches it
  before merge — same fault-injection standard already used for Analytics
  Service downtime in Sprint 6, applied here to prove the CI gate is real
  and not just present.
- **S3 has no automated test** — it is configuration and documentation, not
  code. It is verified only once actually deployed (a future session),
  explicitly flagged as not-yet-verified in the same style as the CSV
  import/export/delete-account manual browser pass that's still open from
  Epic 11.

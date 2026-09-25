# Local development — start sequence, seeding, health checks

S00.10. A reproducible local start, and how to tell each service is
actually up, distinct from the demo seed itself.

## Databases

Three separate Postgres databases, never shared across purposes:

| Database | Purpose | Env file |
|---|---|---|
| `saldovio_dev` | Personal/manual testing data | `finance-api/.env` |
| `saldovio_test` | Automated test runs (`npm test`) | `finance-api/.env.test` |
| `saldovio_demo` | Synthetic demo data | `finance-api/.env.demo` |

```
createdb saldovio_dev    # if not already created
createdb saldovio_test   # if not already created
createdb saldovio_demo
```

Copy each `.env.*.example` to its real filename and fill in
`INTERNAL_API_SECRET` (any random string per environment — the dev, test,
and demo environments' secrets do not need to match each other).

**Two secrets are shared across services and must match, or every
protected route returns 401** (corrected 2026-09-25 — an earlier version
of this note incorrectly said no secret needs to match anything):

- `INTERNAL_API_SECRET` — must be the **same value** in `web/.env.local`
  and whichever `finance-api/.env*` you're running against. `web/` signs
  a short-lived internal JWT with this secret; `finance-api`'s
  `InternalAuthGuard` verifies it with the same secret.
- `ANALYTICS_API_SECRET` — must be the **same value** in `web/.env.local`
  and `analytics-service/.env`. `web/` sends this as a header;
  `analytics-service/auth.py`'s `verify_shared_secret` checks it against
  its own copy.

Only `AUTH_SECRET` (Auth.js's own session-cookie signing key) is
genuinely independent — it never leaves `web/`, so nothing else needs to
know it.

## Start sequence

1. Apply migrations to whichever database you're starting against:
   ```
   cd finance-api
   DATABASE_URL=<that env's DATABASE_URL> npx prisma migrate deploy
   ```
2. Seed, if starting `saldovio_test` or `saldovio_demo`:
   ```
   npm run db:seed:test   # fixed users A/B — finance-api tests read this data
   npm run db:seed:demo   # one synthetic demo user
   ```
   Both are idempotent — re-running deletes and recreates the same fixed
   rows, never accumulates duplicates. Both refuse to run against a database
   whose name doesn't end in `_test`/`_demo` respectively (`scripts/db-guard.ts`).
3. Start all three services (separate terminals):
   ```
   cd finance-api && npm run start:dev   # :3000
   cd analytics-service && source venv/bin/activate && uvicorn main:app --reload   # :8000
   cd web && npm run dev                 # :3001
   ```
   `analytics-service` needs `analytics-service/.env` present (copy from
   `.env.example`) before this will work — `main.py` loads it via
   `python-dotenv` on startup (Epic 15 Story 1). Without it, or with
   `ANALYTICS_API_SECRET` unset in it, the process now fails fast with a
   `KeyError` on import rather than starting and failing every request —
   see the shared-secrets note above for what value it needs.

## Health checks

| Service | Check | Healthy response |
|---|---|---|
| Finance API | `curl http://localhost:3000/` | 200, non-empty body |
| Analytics Service | `curl http://localhost:8000/` | 200, `{"status": "ok"}` |
| Web | open `http://localhost:3001/login` in a browser | login page renders |

None of these is a formal `/health` endpoint with dependency checks
(DB connectivity, etc.) — that's `improvements.md` S13 (Epic 23), not built
yet. These are the "is the process even up" floor.

## Demo login

After `npm run db:seed:demo`: `demo@saldovio.test` / `DemoPassword123!`.
Obviously-synthetic credentials, not meant to be secret — the demo database
holds no real financial data.

## Database credential separation (S04.10)

Three separate databases already exist locally, each with its own
`DATABASE_URL` in a separate env file — no implicit fallback between
them:

- `saldovio_dev` — `finance-api/.env` (gitignored)
- `saldovio_test` — `finance-api/.env.test` (gitignored; `.env.test.example`
  is the committed template)
- `saldovio_demo` — `finance-api/.env.demo` (gitignored; `.env.demo.example`
  is the committed template)

`finance-api/scripts/db-guard.ts` (added under Epic 13's S00 cleanup work)
already refuses to run test fixtures against a database that isn't
explicitly named as the test target — this is that guard's documented
rationale, not new behavior.

## Rate limiting is effectively global, not per-user (S04.4 caveat)

`finance-api`'s `ThrottlerGuard` (`src/app.module.ts`) tracks requests by
`req.ip` by default. Under this app's BFF architecture, the browser never
calls `finance-api` directly — only `web/` does, server-to-server — so
`req.ip` is always `web/`'s own server IP, for every request from every
user. In practice this means login, signup, transaction-create, and
import-route rate limits are one shared global bucket across all users,
not a per-user or per-caller limit. This is a known, accepted tradeoff
for this app's current scale (single `web/` instance, no reverse proxy
in front yet), not a gap that's been silently ignored — a real fix would
need a per-caller tracking key (e.g. derived from the internal-auth
JWT's subject) threaded through a custom `ThrottlerGuard`, deferred as
out of scope for Epic 15 Story 1.

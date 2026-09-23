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
`INTERNAL_API_SECRET` (any random string per environment — they do not need
to match each other).

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

# Epic 15 — Auth/authz/service-boundary hardening (roadmap S04)

Design doc. Source: `improvements.md` §8 (S04, items S04.1-S04.16). Predates
any implementation plan; see `writing-plans` output for task-level breakdown
of Story 1.

## Context

`improvements.md`'s S03 phase (Epic 14, account/balance correctness) closed
2026-09-25 — all 7 items done, last gap (planned transactions leaking into
current-balance) fixed in `904d5d0`. Per the delivery-order table (`improvements.md`
§3), S04 is next: it depends only on S00 (test/debug environment, already
substantially done under Epic 13's cleanup story even though its checkboxes
in `improvements.md` are stale) and is itself a prerequisite for S05
(editable transactions/atomic transfers).

`docs/roadmap/2026-09-23-target-model.md` (Epic 13 Story 5) already
forward-references pieces of this work under specific epic/story numbers:

- `User.sessionVersion` → "Epic 15 Story 3"
- Idempotency record → "Epic 15 Story 5"
- Hashed recovery tokens / security audit → "**Epic 24** Story 1"

This spec aligns with that prior allocation rather than overriding it
(user decision, 2026-09-25): password change/recovery (S04.6) and email
verification (S04.7) are **out of scope** here — deferred to Epic 24, which
owns the token table they need. Everything else in S04 lands in Epic 15.

**Current-state audit** (grounds the "what's actually missing" claims below,
not assumed from the checklist alone):

- `finance-api/src/main.ts`: `app.enableCors()` — no origin restriction.
- `finance-api/src/auth/internal-auth.guard.ts`: `jwtVerify(token, secret)`
  with no explicit `algorithms`/`issuer`/`audience` option, and
  `request.userId = Number(payload.sub)` with no check that the result is a
  positive integer or that the user still exists/is active.
- `analytics-service/main.py`: `POST /forecast` has no auth at all — any
  caller who can reach the service can run it.
- No rate-limiting package installed anywhere (`@nestjs/throttler` absent
  from `finance-api/package.json`).
- No security-headers/CSP middleware in `web/` (`next.config.ts` only
  configures `serverActions.bodySizeLimit`).
- Controller-level guard coverage is otherwise already correct: every
  `finance-api` controller except the two genuinely-public routes
  (`POST /users` signup, `POST /auth/login`) carries `@UseGuards(InternalAuthGuard)`
  (verified by grepping all 5 controllers). S04.8/9 is therefore a
  verification-and-test pass over per-object ownership inside services
  (nested resources, cross-account references), not a rewiring of missing
  guards.

## Decisions

- **Two stories, not one** (revised from an initial "one combined story"
  call after the target-model.md conflict above surfaced): Story 1 takes
  everything except session revocation; Story 2 is session revocation alone,
  matching its pre-existing "Story 3" tag (renumbered to 2 — nothing
  occupies a real Story 2, target-model.md's numbering was a forward guess
  from Epic 13, not a binding sequence).
- **Rate-limit storage: in-memory per process**, not Redis/shared. Every
  service is single-instance on free-tier hosting (Epic 12 S3, not yet
  deployed) — there is no second instance for an in-memory limiter to be
  wrong about today. Documented as a named limitation (matches this
  project's standing "free-tier tradeoff, not silently ignored" pattern),
  revisit if a second instance ever exists. Library: `@nestjs/throttler`
  (official NestJS package, avoids hand-rolling token-bucket logic) —
  version and API to be confirmed via context7 before implementation, not
  assumed from training data (CLAUDE.md's mandatory-tooling rule).
- **CORS narrowing (S04.12):** `finance-api`'s `app.enableCors()` replaced
  with an explicit origin allowlist (the deployed `web` origin(s), plus
  `localhost` for dev) — closes Epic 12's parked decision, which explicitly
  said this epic is where CORS gets tightened.
- **Analytics Service auth (S04.11):** shared-secret header check on
  `POST /forecast`, mirroring the existing `INTERNAL_API_SECRET` pattern
  between `web` and `finance-api` — a new secret (`ANALYTICS_API_SECRET`),
  not reuse of `INTERNAL_API_SECRET`, so a leak of one service's secret
  doesn't compromise the other. Plus request-size/horizon bounds already
  partly done (Epic 11 S1's 366-day ceiling) — this story adds the auth
  layer, not new bounds.
- **CSP (S04.14):** report-only mode only in this story, per the checklist's
  own instruction — no enforcement, so nothing can break production
  rendering (Recharts, `foreignObject` tick labels) as a side effect of
  this epic. Enforcement mode is a future story once report data is clean.
- **Session revocation mechanism (Story 2, designed now, built later):**
  `User.sessionVersion: Int @default(0)` (Prisma migration). Incremented on
  password change, account deletion, and a new explicit "sign out all
  devices" action. Auth.js JWT strategy is stateless by design, so
  revocation needs one authoritative check per request: the `jwt()`
  callback compares the token's embedded version against a fresh DB read on
  each session access. This is a real per-request DB hit — acceptable
  given Next.js's existing request-memoized `auth()` pattern already
  established in Epic 8 Story 2 (one call per request, not per component).
  Account deletion already exists (`DELETE /users/me`, Epic 11 S5) and gets
  no new work here beyond the version bump; this story's real surface is
  the new "sign out all devices" action and wiring the version check into
  `authorize()`/`jwt()`.

## Architecture / stories

### Story 1 — Startup validation, JWT hardening, rate limiting, resource/network boundaries

Scope: S04.1, S04.2, S04.4, S04.5, S04.8, S04.9, S04.10, S04.11, S04.12,
S04.13, S04.14, S04.15, S04.16.

- **S04.1 — Startup secret/env validation.** `finance-api/src/main.ts` and
  `web`'s startup path both fail fast (non-zero exit / thrown error before
  the server binds a port) if `INTERNAL_API_SECRET`, `ANALYTICS_API_SECRET`,
  `AUTH_SECRET`, or `DATABASE_URL` are missing or empty. Values themselves
  never logged, only presence/absence.
- **S04.2 — JWT verification hardening.** `internal-auth.guard.ts`'s
  `jwtVerify` call gains explicit `algorithms: ['HS256']`, plus issuer/
  audience claims added at signing time (`web/lib/internal-auth.ts`) and
  checked at verification time. `payload.sub` validated as a positive
  integer before use; malformed subjects rejected with the same generic
  401 as any other invalid token (no distinct error message that would
  leak *why* it failed). A soft check that the referenced user still
  exists is added where the guard can cheaply do it — full "inactive/
  deleted user" enforcement piggybacks on Story 2's `sessionVersion` work
  where it belongs more naturally (checking existence twice would be
  redundant); this story adds the claim/algorithm hardening only.
- **S04.4 — Rate limiting.** `@nestjs/throttler` (or current equivalent
  per context7) on login, signup, import preview/commit, and the
  forecast-triggering routes. Trusted-proxy handling verified against
  whatever reverse proxy Render/Vercel actually put in front (documented,
  not assumed, since S3/deploy hasn't executed yet — verify the header
  Render's edge actually sets once deployed; until then, document the
  assumption).
- **S04.5 — Generic auth responses, bcrypt byte limit.** `POST /auth/login`
  already returns the same "Invalid credentials" message for unknown-email
  and wrong-password (done since Sprint 3) — this story adds a timing-
  difference check (constant-ish response time regardless of which failed)
  and verifies `bcryptjs`'s 72-byte truncation behavior against its actual
  docs (context7), with an explicit password-length cap enforced before
  hashing so truncation is never silent.
- **S04.8/S04.9 — Ownership verification pass.** Guard coverage is already
  structurally complete (audited above). This story adds negative-path
  tests per resource type (`accounts`, `transactions`, `recurring-rules`,
  `users/me/settings`) proving user B gets 403/404 on user A's resources by
  ID substitution — brief §12's standing rule, now with tests closing the
  loop rather than just the guard existing.
- **S04.10 — Credential/role separation by environment.** Document (not
  necessarily code-change) that dev/test/prod use separate `DATABASE_URL`s
  — already true in practice (S00's test-DB isolation work) — and note
  Prisma's migration role vs. runtime role as a documented, not-yet-enforced
  gap if Postgres-level role separation doesn't exist yet (Neon's free tier
  may not support multiple roles — confirmed at S3/deploy time, not here).
- **S04.11 — Analytics Service auth + bounds.** Shared-secret header check
  (see Decisions), applied to `POST /forecast` only (the only mutating/
  expensive route Analytics Service exposes beyond its already-public
  health check).
- **S04.12 — CORS narrowing.** See Decisions.
- **S04.13 — CSRF/origin/cookie checks.** Verified against the installed
  Auth.js v5 + Next.js 16 versions via context7 — Server Actions have
  built-in origin checking in recent Next.js versions; this story confirms
  that's actually active (not assumed) and checks cookie flags
  (`secure`/`httpOnly`/`sameSite`) match production expectations.
- **S04.14 — Security headers + CSP (report-only).** New headers
  middleware in `web` (likely `proxy.ts` or a dedicated headers helper) —
  CSP allow-list covers Recharts/Next.js's own requirements, report-only,
  reports scrubbed of anything sensitive before they'd ever be logged.
- **S04.15 — Input bounds + controlled error responses.** Audit existing
  Zod schemas (`web/lib/schemas/`, `finance-api`'s DTOs) for missing
  length/array/pagination bounds; add a global exception filter in
  `finance-api` (the gap repeatedly noted-but-deferred since Sprint 7 S1 —
  this is the story that finally owns it) converting unhandled errors into
  a generic 500 with no stack trace/SQL/token leakage.
- **S04.16 — No cross-user response caching.** Verify `Cache-Control:
  private, no-store` (or equivalent) on every financial API response and
  every `web` Server Component page that renders user data; add a test for
  shared-device back-navigation after logout.

### Story 2 — Session revocation

Scope: S04.3 only. `User.sessionVersion` migration, increment on password
change (Epic 24, hook point only — the increment call, not the password-
change feature itself)/account deletion/new "sign out all devices" action,
version check wired into Auth.js's `jwt()` callback. Full design deferred
to this story's own planning pass — not detailed further here beyond the
mechanism already fixed in Decisions, since Story 1 ships first.

### Deferred to Epic 24

S04.6 (password change/recovery — needs hashed-at-rest single-use
recovery tokens, a new table Epic 24 owns) and S04.7 (email verification —
needs a real mail-delivery service, same epic). Not touched by Epic 15.

## Data flow / infra notes

No architecture change — this epic hardens boundaries between the existing
three components (`web` ↔ `finance-api` ↔ `analytics-service`), it doesn't
add new services or change who talks to whom. `ANALYTICS_API_SECRET` is a
new secret alongside the existing `INTERNAL_API_SECRET`/`AUTH_SECRET`, all
three documented in `docs/deploy.md` (Epic 12 S3) once that story actually
runs.

## Error handling

- Startup validation failures (S04.1) crash the process immediately with a
  clear (secret-free) message — fail fast, not a silent default.
- Rate-limit exceedance returns 429 with a `Retry-After` header, no
  internal detail.
- The new global exception filter (S04.15) is the last line of defense —
  everything else should already return a typed, intentional response.
- CSP violations only report in this story (no blocking), so a
  misconfigured directive can't take down rendering.

## Testing

- Negative-path suite per resource type (S04.8/9), extending the existing
  curl-based / Vitest-based negative-path pattern already used since Epic 7
  S4.
- Rate-limit test: fire past the configured threshold, assert 429, assert
  reset after the window (matches Sprint 6's fault-injection standard —
  actually trigger the condition, don't just assert the code path exists
  by inspection).
- JWT hardening test: forged algorithm (`alg: none`), wrong issuer/
  audience, non-positive/non-numeric `sub` — each asserted to fail with
  the same generic 401.
- Analytics Service: request with no/wrong shared secret → 401/403;
  request within bounds → 200 (regression, not new — Epic 11 S1 already
  covers the day-bound case).
- CORS: a request from a non-allowlisted origin is rejected (integration
  test against the actual CORS config, not just reading the config).
- Full local + CI (Epic 12 S2) pass required before merge, same as every
  prior story.

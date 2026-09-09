# Design: Technical Foundation (sub-project 1 of 5 — dark/lime UI implementation)

## Context

A high-fidelity UI design handoff (`design_handoff_saldovio_dashboard/`) arrived for Saldovio's dashboard: 6 screens (Overview, Transactions, Accounts, Forecast, Simulator "Can I afford it?", Settings) in a dark/lime theme, plus two roadmap-stage features not yet built (Simulator = roadmap stage 6, CSV import = roadmap stage 7).

The full handoff is too large for one spec (brief §13 forbids dumping multiple roadmap stages into one lesson/change). It was decomposed into 5 sub-projects, each with its own spec → plan → implementation cycle:

1. **Technical foundation** (this spec) — Zod, Prisma, two-layer route protection, Vitest+jsdom+RTL. No UI changes.
2. Visual reskin (dark/lime theme applied to existing Overview/Accounts/Transactions, no new features).
3. Simulator "Can I afford it?" (roadmap stage 6).
4. Dedicated Forecast screen (Line/Weeks/Calendar chart modes).
5. Settings + CSV import (roadmap stage 7).

This spec covers only #1. It has no user-visible change — it changes how the app is built, not what it looks like or does.

## Decisions (confirmed with user before writing this spec)

- **Prisma:** full migration. All 5 existing raw-SQL services (`users`, `accounts`, `transactions`, `recurring-rules`, `auth`) move to Prisma Client. No dual data-access convention left behind.
- **Zod:** both layers. `finance-api` replaces `class-validator`/`class-transformer` DTOs with Zod schemas (via `nestjs-zod`). `web` gets parallel Zod schemas for client-side form validation before Server Actions fire.
- **Route protection:** two layers. Next.js `proxy.ts` (renamed from `middleware.ts` in Next.js 16 — see Architecture) for a fast, route-level session check + redirect. `auth()` server-side in every Server Component/Action stays as the real authorization boundary — `proxy.ts` is UX, not security. The dashboard becomes gated (it currently is not).
- **Testing:** setup + tests for what this sub-project actually changes (route-protection logic, Zod schemas). Not full retroactive coverage of pre-existing components — that happens story-by-story as the reskin (#2) touches them.

## Architecture

### Data layer: Prisma

`finance-api/prisma/schema.prisma` mirrors the 5 tables already defined by `db/migrations/0001`–`0004`. Those SQL files stay in git as historical record (append-only migration history is documented reasoning, not disposable scaffolding); `prisma migrate` takes over authoring future schema changes from this point forward.

`NUMERIC(14,2)` maps to `Decimal @db.Decimal(14,2)`. Prisma Client returns these as `Decimal.js` instances, not strings or JS numbers.

**Gotcha, load-bearing:** every response that serializes a `Decimal` field to JSON must call `.toString()` explicitly at the DTO boundary. Relying on default `JSON.stringify`/class-transformer behavior is not acceptable here — CLAUDE.md's "money is never a float" rule has already been enforced once at the `pg` layer (raw decimal strings, no `parseFloat`) and once at the Pydantic layer (confirmed via context7 that `Decimal` always serializes as a JSON string). This is the third layer where the same invariant must be independently verified, not assumed. Each service gets a test asserting the wire-format `amount`/`balance` field is a string matching `/^-?\d+\.\d{2}$/`, not a JS number.

Atomic multi-step writes (signup: create user + default account together) move from manual `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK` to `prisma.$transaction(async (tx) => { ... })` — automatic rollback on thrown error, same guarantee, less hand-rolled plumbing.

### Validation: Zod

`finance-api`: `nestjs-zod`'s `createZodDto(schema)` replaces each `class-validator` DTO class. `ZodValidationPipe` registered globally via `APP_PIPE` in `AppModule`, replacing the global `ValidationPipe`. Existing validation behavior (e.g. `amount` must be positive on recurring rules, `dayOfMonth` 1–31) is preserved, expressed as Zod refinements instead of decorators.

`web`: one Zod schema per form (transaction, account, recurring rule, signup, login), colocated in `web/lib/schemas/`. Each Server Action calls `schema.safeParse(formData)` before doing anything else; on failure, returns field-level errors to the form instead of making the round-trip to Finance API. This is a UX improvement (faster feedback) layered on top of — not instead of — Finance API's own Zod validation, which remains the authoritative boundary per the existing "server-side ownership/validation" rule in CLAUDE.md.

### Route protection

Next.js 16 renamed `middleware.ts` to `proxy.ts` and moved it from the edge runtime to the Node.js runtime — this changes what's safe to do inside it (no more edge-runtime restrictions to work around) and is a correction to the architecture as understood when `auth.ts` was first written in Sprint 3.

`web/proxy.ts`:
```ts
export { auth as proxy } from "@/auth"
```
with an `authorized` callback added to `web/auth.ts`'s config: unauthenticated requests to any route other than `/login` and `/signup` redirect to `/login`. Matcher excludes `/api`, static assets.

This is layer 1 — fast, but bypassable by misconfiguration (wrong matcher, callback bug) and not a substitute for real authorization. Layer 2 is unchanged: every Server Component and Server Action still calls `auth()` and checks the session itself before touching data. The dashboard (`web/app/page.tsx`), currently reachable without a session (documented as an intentional gap in CLAUDE.md pending this exact work), becomes gated by both layers.

### Testing

`web/vitest.config.ts`: `environment: 'jsdom'`, `@testing-library/react` + `@testing-library/jest-dom` as new devDependencies. `finance-api` already has Vitest configured (Sprint 2) — no new setup needed there beyond whatever Prisma/Zod migration requires of existing tests (there are none yet at the unit level; this doesn't change in this sub-project).

Tests written in this sub-project, scoped to what it changes:
- `proxy`/`authorized` callback: authenticated request passes through, unauthenticated request to a protected route redirects, unauthenticated request to `/login` does not redirect (no loop).
- Each Zod schema (web and finance-api sides): valid input accepted, key invalid cases rejected (negative amount where positive required, malformed date, out-of-range `dayOfMonth`).
- Decimal-serializes-as-string assertion described above, one per service touching money.

Full retroactive test coverage of existing components (`TransactionForm`, `page.tsx`, etc.) is explicitly out of scope here — deferred to sub-project 2, where those files are rewritten anyway for the reskin, so tests get written against their final shape instead of a shape about to be discarded.

## Error handling

- Prisma migration failures (schema drift, failed `prisma migrate`) are a deploy-time concern, not a runtime one — no new runtime error handling needed beyond what NestJS already does.
- Zod validation failures on `web` surface as field-level form errors (existing Server Action error-return pattern, no new mechanism). On `finance-api`, `ZodValidationPipe` throws `ZodValidationException`, mapped to the same 400 response shape `ValidationPipe` produced — no client-visible behavior change, only the validation library underneath.
- `proxy.ts` redirect failures (misconfigured matcher) fail closed by construction: layer 2 (`auth()` in the Server Component) still blocks unauthenticated access even if layer 1 misfires. This is the explicit reason for two layers rather than one.

## Process

Jira: broken into epics/sprints/backlog as usual, guided (not performed) by Claude — same working pattern as Sprints 1–6. This spec's scope becomes one epic; the writing-plans step that follows converts it into sequenced stories.

## Out of scope (this sub-project)

No UI/CSS changes, no new screens, no Simulator/CSV-import logic. Sub-projects 2–5 build on top of this foundation but are separate specs.

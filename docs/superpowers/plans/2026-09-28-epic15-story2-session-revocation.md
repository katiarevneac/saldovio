# Epic 15 Story 2 — Session Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close `improvements.md` S04.3 — give Auth.js's stateless JWT sessions a real revocation mechanism (`User.sessionVersion`), checked on every request, plus a user-facing "sign out all devices" action.

**Architecture:** `User.sessionVersion: Int @default(0)` (Prisma). `AuthService.login` returns it; Auth.js's `authorize()` embeds it into the token at sign-in. On every subsequent request, `web/auth.ts`'s `jwt()` callback calls a new `GET /users/me/session-version` (Finance API, `InternalAuthGuard`-protected) and compares against the token's embedded version — a mismatch (or a 404, meaning the user was deleted) returns `null` from the callback, which Auth.js treats as an invalidated session. A new `POST /users/me/sign-out-all-devices` bumps the stored version by one, invalidating every outstanding session (including the caller's own — the action signs the caller out immediately afterward rather than waiting for their next request to discover it). Account deletion (`DELETE /users/me`, already built) needs no new code: deleting the user row makes the version check 404, which already invalidates.

**Tech Stack:** NestJS (Prisma, `@nestjs/throttler`'s existing global guard, `NotFoundException`), Next.js/Auth.js v5 (`jwt` callback, JWT session strategy), `jose` (existing internal-JWT signing), Vitest (both services), Supertest (finance-api e2e).

**Spec:** `docs/superpowers/specs/2026-09-25-epic15-auth-security-hardening-design.md` (§"Session revocation mechanism", §"Story 2 — Session revocation"). Source finding: `improvements.md` §8, S04.3.

## Global Constraints

- Out of scope, deferred to Epic 24 (per spec): S04.6 (password change/recovery), S04.7 (email verification). Do not build a password-change endpoint here — `UsersService.bumpSessionVersion` is written as a reusable method specifically so Epic 24 can call it later, but nothing in this plan wires it to a password-change flow because that flow doesn't exist yet.
- Response bodies from `finance-api` use snake_case field names (matches every existing endpoint — `getSettings`'s `essential_spend`/`horizon_days`, etc.). The new `GET /users/me/session-version` follows this: `{ session_version: number }`.
- `finance-api` test commands (`npm test`, `npm run test:e2e`) refuse to run against anything but a database whose name ends in `_test` (`test/setup-db-guard.ts`) — this is already wired up, nothing to change, just don't work around it.
- Every new finance-api route under `/users/me/*` in this plan is guarded by the existing `InternalAuthGuard` (`@UseGuards(InternalAuthGuard)`) — never trust a caller-supplied user id (brief §12, restated in the spec's Context section).
- `web/lib/internal-auth.ts` and any new `web/lib/*.ts` file that reads `INTERNAL_API_SECRET` or calls `auth()`/does server-only I/O keeps the existing `import "server-only"` guard — the build must fail if it's ever imported into a Client Component.
- Run `npx prisma generate` in `finance-api` after any schema change, on both the working tree and (for tests) before running `npm test` — the generated client under `finance-api/src/generated/prisma` must exist and be current, or every test fails with a stale-client error (this bit every Epic 11 story that touched `schema.prisma`).
- Verify library usage against `context7` before writing code that depends on exact API shape (Prisma's `increment` update syntax, Auth.js v5's `jwt` callback return-`null`-to-invalidate contract — already confirmed against `/nextauthjs/next-auth` docs during planning, cited inline where it matters) — this is CLAUDE.md's standing mandatory-tooling rule, not optional per-task judgment.

---

### Task 1: `User.sessionVersion` schema + migration

**Files:**
- Modify: `finance-api/prisma/schema.prisma:10-21` (the `User` model)
- Create: a new Prisma migration folder under `finance-api/prisma/migrations/` (name and exact timestamp assigned by the Prisma CLI — do not hand-write the SQL file, this project's standing convention since Epic 7 S1 is "Prisma owns schema changes")

**Interfaces:**
- Produces: `User.sessionVersion` — a Prisma `Int` field, DB column `session_version`, `NOT NULL DEFAULT 0`. Every later task in this plan reads/writes it as `prisma.user.<op>(...).sessionVersion` (camelCase, Prisma's standard mapping from the `@map("session_version")` directive already used by every other field on this model).

- [ ] **Step 1: Add the field to the schema**

Edit `finance-api/prisma/schema.prisma`, inside `model User { ... }` (currently lines 10-21), add one line after `horizonDays`:

```prisma
model User {
  id             Int       @id @default(autoincrement())
  email          String    @unique
  passwordHash   String    @map("password_hash")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  essentialSpend Decimal?  @map("essential_spend") @db.Decimal(14, 2)
  payday         Int?
  horizonDays    Int       @default(30) @map("horizon_days")
  sessionVersion Int       @default(0) @map("session_version")
  accounts       Account[]

  @@map("users")
}
```

- [ ] **Step 2: Generate and apply the migration against the dev database**

Run (from `finance-api/`, with the default `.env` `DATABASE_URL` pointing at `saldovio_dev`, same as every prior migration in this project):

```bash
cd finance-api
npx prisma migrate dev --name add_user_session_version
```

Expected: Prisma prints a new migration folder name (e.g. `202609281_add_user_session_version`), applies it to `saldovio_dev`, and regenerates the client. Confirm the generated `migration.sql` contains exactly:

```sql
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;
```

If Prisma's autogenerated SQL differs in substance (not just formatting), stop and investigate before proceeding — do not hand-edit it to force a match.

- [ ] **Step 3: Apply the same migration to the test database**

Read `finance-api/.env.test`'s `DATABASE_URL` value (do not guess it or hardcode a new one). Apply the migration there without regenerating:

```bash
cd finance-api
DATABASE_URL="<value from .env.test>" npx prisma migrate deploy
```

Expected: Prisma reports the one new migration applied, `saldovio_test` schema now matches `saldovio_dev`.

- [ ] **Step 4: Verify the generated client**

```bash
cd finance-api
npx prisma generate
npm test -- --run src/users/users.service.spec.ts
```

Expected: existing `users.service.spec.ts` tests still pass unchanged (this step only proves the schema/client change didn't break anything yet — no new test exists until Task 2).

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add User.sessionVersion column (Epic 15 Story 2, S04.3 schema)"
```

---

### Task 2: `UsersService.getSessionVersion` + `bumpSessionVersion`

**Files:**
- Modify: `finance-api/src/users/users.service.ts`
- Modify: `finance-api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (already injected in this service's constructor), `Prisma.PrismaClientKnownRequestError` (already imported from `../generated/prisma/client.js` in this file for the existing `UNIQUE_CONSTRAINT_VIOLATION` check).
- Produces: `getSessionVersion(userId: number): Promise<{ session_version: number }>` — throws `NotFoundException` if the user doesn't exist. `bumpSessionVersion(userId: number): Promise<void>` — throws `NotFoundException` if the user doesn't exist (instead of leaking a raw Prisma error to the global exception filter's generic 500). Both consumed by Task 3's controller routes.

- [ ] **Step 1: Write the failing tests**

Add to `finance-api/src/users/users.service.spec.ts`, inside the existing `describe('UsersService', ...)` block (after the existing tests, before the closing `});`):

```typescript
  it('getSessionVersion returns 0 for a freshly created user', async () => {
    const user = await service.create({ email: testEmail, password: 'password123' });

    const result = await service.getSessionVersion(user.id);

    expect(result).toEqual({ session_version: 0 });
  });

  it('getSessionVersion throws NotFoundException for a nonexistent user', async () => {
    await expect(service.getSessionVersion(999999999)).rejects.toThrow('User not found');
  });

  it('bumpSessionVersion increments the stored version by exactly one', async () => {
    const user = await service.create({ email: testEmail, password: 'password123' });

    await service.bumpSessionVersion(user.id);
    expect(await service.getSessionVersion(user.id)).toEqual({ session_version: 1 });

    await service.bumpSessionVersion(user.id);
    expect(await service.getSessionVersion(user.id)).toEqual({ session_version: 2 });
  });

  it('bumpSessionVersion throws NotFoundException for a nonexistent user', async () => {
    await expect(service.bumpSessionVersion(999999999)).rejects.toThrow('User not found');
  });
```

This file's `import { Prisma } from '../generated/prisma/client.js';` and `NotFoundException` are not yet imported in the test file — the tests above only call public `UsersService` methods, so no new test-file imports are needed.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd finance-api
npm test -- --run src/users/users.service.spec.ts
```

Expected: FAIL — `service.getSessionVersion is not a function` (and similarly for `bumpSessionVersion`).

- [ ] **Step 3: Implement**

Edit `finance-api/src/users/users.service.ts`. First, add `NotFoundException` to the existing `@nestjs/common` import (line 1):

```typescript
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
```

Add a second error-code constant near the existing `UNIQUE_CONSTRAINT_VIOLATION` (line 10):

```typescript
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';
```

Add the two new methods to the `UsersService` class, after `updateSettings` (currently ending at line 94) and before `deleteAccount`:

```typescript
  async getSessionVersion(userId: number): Promise<{ session_version: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { session_version: user.sessionVersion };
  }

  // Reusable hook: Epic 24's password-change flow will call this too, on
  // top of its own token-consumption logic (design spec, "Decisions" —
  // "a hook point only, not the password-change feature itself").
  async bumpSessionVersion(userId: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === RECORD_NOT_FOUND
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd finance-api
npm test -- --run src/users/users.service.spec.ts
```

Expected: all tests in the file PASS, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/users/users.service.ts src/users/users.service.spec.ts
git commit -m "feat: UsersService.getSessionVersion/bumpSessionVersion (Epic 15 Story 2)"
```

---

### Task 3: Controller routes + ownership/e2e tests

**Files:**
- Modify: `finance-api/src/users/users.controller.ts`
- Modify: `finance-api/test/ownership-boundaries.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsersService.getSessionVersion`/`bumpSessionVersion` (Task 2), existing `InternalAuthGuard`, `CurrentUserId` decorator — all already imported in this controller file.
- Produces: `GET /users/me/session-version` → `200 { session_version: number }` or `401` (no/bad token). `POST /users/me/sign-out-all-devices` → `204` or `401`. Consumed by Task 5's `web/lib/session-version.ts` (GET) and Task 7's `signOutAllDevicesAction` (POST).

- [ ] **Step 1: Write the failing e2e tests**

Add to `finance-api/test/ownership-boundaries.e2e-spec.ts`, inside the existing `describe('ownership boundaries (S04.8/9)', ...)` block, after the existing test cases (before the file's closing `});`). This file already has `userA`/`userB`/`tokenB` set up in `beforeAll` (see the file's existing structure) — reuse them, and additionally sign a token for `userA`:

First, add one more `let` near the existing `tokenB: string;` declaration and set it in `beforeAll` alongside the existing `tokenB = await signInternalToken(String(userB.id));` line:

```typescript
  let tokenA: string;
```

```typescript
    tokenA = await signInternalToken(String(userA.id));
```

Then add the new test cases:

```typescript
  describe('session revocation (S04.3)', () => {
    it('GET /users/me/session-version returns the caller\'s own version, not another user\'s', async () => {
      const responseA = await request(app.getHttpServer())
        .get('/users/me/session-version')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(responseA.status).toBe(200);
      expect(responseA.body).toEqual({ session_version: 0 });

      await request(app.getHttpServer())
        .post('/users/me/sign-out-all-devices')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(204);

      // Bumping B's version must never affect A's.
      const responseAAfter = await request(app.getHttpServer())
        .get('/users/me/session-version')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(responseAAfter.body).toEqual({ session_version: 0 });

      const responseBAfter = await request(app.getHttpServer())
        .get('/users/me/session-version')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(responseBAfter.body).toEqual({ session_version: 1 });
    });

    it('rejects GET and POST session-version routes with no token', async () => {
      await request(app.getHttpServer()).get('/users/me/session-version').expect(401);
      await request(app.getHttpServer()).post('/users/me/sign-out-all-devices').expect(401);
    });
  });
```

Note: this test mutates `userB`'s `sessionVersion` (bumps it to 1) as a side effect — the file's existing `afterAll` already deletes both `userA` and `userB` wholesale, so no extra cleanup is needed.

- [ ] **Step 2: Run to verify failure**

```bash
cd finance-api
npm run test:e2e -- --run test/ownership-boundaries.e2e-spec.ts
```

Expected: FAIL — both new routes 404 (don't exist yet).

- [ ] **Step 3: Implement the routes**

Edit `finance-api/src/users/users.controller.ts`, add two routes after the existing `updateSettings` route and before `deleteAccount`:

```typescript
  @UseGuards(InternalAuthGuard)
  @Get('me/session-version')
  getSessionVersion(@CurrentUserId() userId: number) {
    return this.usersService.getSessionVersion(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Post('me/sign-out-all-devices')
  @HttpCode(204)
  signOutAllDevices(@CurrentUserId() userId: number) {
    return this.usersService.bumpSessionVersion(userId);
  }
```

(`Get`, `Post`, `HttpCode`, `UseGuards` are all already imported at the top of this file — no new imports needed.)

- [ ] **Step 4: Run to verify pass**

```bash
cd finance-api
npm run test:e2e -- --run test/ownership-boundaries.e2e-spec.ts
```

Expected: PASS, including the 2 new tests. Also run the full e2e suite once to confirm no regression:

```bash
npm run test:e2e
```

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/users/users.controller.ts test/ownership-boundaries.e2e-spec.ts
git commit -m "feat: GET session-version + POST sign-out-all-devices routes (Epic 15 Story 2)"
```

---

### Task 4: `AuthService.login` returns `sessionVersion`

**Files:**
- Modify: `finance-api/src/auth/auth.service.ts`
- Modify: `finance-api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Produces: `AuthService.login(dto)` now resolves `{ id: number, email: string, sessionVersion: number }` (was `{ id, email }`). Consumed by `web/auth.ts`'s `authorize()` (Task 6), which currently does `return await response.json();` untyped — this task changes what that JSON body contains, Task 6 is what actually reads the new field.

- [ ] **Step 1: Write the failing test**

Add to `finance-api/src/auth/auth.service.spec.ts`, inside the existing `describe('AuthService', ...)` block, after the existing `'logs in with correct credentials'` test:

```typescript
  it('includes the current sessionVersion in a successful login response', async () => {
    const result = await service.login({ email: testEmail, password });
    expect(result.sessionVersion).toBe(0);

    await prisma.user.update({ where: { email: testEmail }, data: { sessionVersion: 3 } });
    const resultAfterBump = await service.login({ email: testEmail, password });
    expect(resultAfterBump.sessionVersion).toBe(3);
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
cd finance-api
npm test -- --run src/auth/auth.service.spec.ts
```

Expected: FAIL — `result.sessionVersion` is `undefined`.

- [ ] **Step 3: Implement**

Edit `finance-api/src/auth/auth.service.ts`, line 29 (`return { id: user.id, email: user.email };`), change to:

```typescript
    return { id: user.id, email: user.email, sessionVersion: user.sessionVersion };
```

- [ ] **Step 4: Run to verify pass**

```bash
cd finance-api
npm test -- --run src/auth/auth.service.spec.ts
```

Expected: PASS. Then run the full finance-api unit suite once:

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
cd finance-api
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat: AuthService.login returns sessionVersion (Epic 15 Story 2)"
```

---

### Task 5: `web` — export `signInternalToken` + `fetchSessionVersion`

**Files:**
- Modify: `web/lib/internal-auth.ts`
- Create: `web/lib/internal-auth.spec.ts`
- Create: `web/lib/session-version.ts`
- Create: `web/lib/session-version.spec.ts`

**Interfaces:**
- Consumes: `web/lib/config.ts`'s `FINANCE_API_URL` (already exported).
- Produces: `signInternalToken(userId: string): Promise<string>` — now exported from `internal-auth.ts` (was module-private). `fetchSessionVersion(userId: string): Promise<SessionVersionResult>` where `SessionVersionResult = { status: "current"; version: number } | { status: "not-found" } | { status: "unavailable" }`. Consumed by Task 6's `session-jwt.ts`.

- [ ] **Step 1: Export `signInternalToken` (no behavior change) and add its test**

Edit `web/lib/internal-auth.ts` — change line 15 from:

```typescript
async function signInternalToken(userId: string): Promise<string> {
```

to:

```typescript
export async function signInternalToken(userId: string): Promise<string> {
```

That's the only change to this file. Create `web/lib/internal-auth.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

describe("signInternalToken", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
  });

  it("signs a token with the expected subject, issuer, and audience", async () => {
    const { jwtVerify } = await import("jose");
    const { signInternalToken } = await import("./internal-auth");

    const token = await signInternalToken("42");
    const secret = new TextEncoder().encode("test-internal-secret");
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "saldovio-web",
      audience: "saldovio-finance-api",
    });

    expect(payload.sub).toBe("42");
  });
});

describe("getAuthorizedHeaders", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
    vi.resetModules();
  });

  it("throws when there is no session", async () => {
    vi.doMock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
    const { getAuthorizedHeaders } = await import("./internal-auth");

    await expect(getAuthorizedHeaders()).rejects.toThrow("Not authenticated");
  });
});
```

- [ ] **Step 2: Run to verify pass (this step is a refactor + new test, not new behavior — both should already pass)**

```bash
cd web
npm test -- --run lib/internal-auth.spec.ts
```

Expected: PASS. (If the `getAuthorizedHeaders` test fails on the `@/auth` mock path alias, check `vitest.config.ts`'s existing `resolve.alias` — every other spec in this project mocking `@/auth` — e.g. `web/app/(dashboard)/settings/page.spec.tsx` — uses the same `vi.mock("@/auth", ...)` form; match it exactly rather than debugging the alias from scratch.)

- [ ] **Step 3: Write the failing tests for `fetchSessionVersion`**

Create `web/lib/session-version.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { signInternalTokenMock } = vi.hoisted(() => ({
  signInternalTokenMock: vi.fn(),
}));
vi.mock("./internal-auth", () => ({ signInternalToken: signInternalTokenMock }));

describe("fetchSessionVersion", () => {
  beforeEach(() => {
    signInternalTokenMock.mockReset();
    signInternalTokenMock.mockResolvedValue("signed-token");
  });

  it("returns the current version on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ session_version: 3 }),
      })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "current", version: 3 });
  });

  it("returns not-found on a 404 (deleted user)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "not-found" });
  });

  it("returns unavailable on a non-404 error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the fetch itself throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when signing the internal token itself fails", async () => {
    signInternalTokenMock.mockRejectedValue(new Error("no secret configured"));
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd web
npm test -- --run lib/session-version.spec.ts
```

Expected: FAIL — module `./session-version` doesn't exist yet.

- [ ] **Step 5: Implement**

Create `web/lib/session-version.ts`:

```typescript
import "server-only";
import { FINANCE_API_URL } from "./config";
import { signInternalToken } from "./internal-auth";

export type SessionVersionResult =
  | { status: "current"; version: number }
  | { status: "not-found" }
  | { status: "unavailable" };

// Deliberate fail-open/fail-closed split (Epic 15 Story 2 design decision,
// made during planning — not in the spec verbatim): a 404 means the user
// row itself is gone (deleted account, or a since-rotated fixture in
// tests) — that's an authoritative "this session must end," so it
// invalidates. Any other failure (network error, 5xx, the internal token
// itself failing to sign) means we simply don't know the current version
// — treated as "unavailable," which session-jwt.ts's resolveSessionVersion
// keeps the existing session alive for, rather than logging out every
// active user during a Finance API hiccup. This trades a theoretically
// tighter revocation guarantee for availability, consistent with this
// project's documented "single free-tier instance, no distributed state"
// posture (see the spec's rate-limiting decision for the same tradeoff
// made explicitly elsewhere).
export async function fetchSessionVersion(userId: string): Promise<SessionVersionResult> {
  let token: string;
  try {
    token = await signInternalToken(userId);
  } catch {
    return { status: "unavailable" };
  }

  let response: Response;
  try {
    response = await fetch(`${FINANCE_API_URL}/users/me/session-version`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }
  if (!response.ok) {
    return { status: "unavailable" };
  }

  const body = await response.json();
  return { status: "current", version: body.session_version };
}
```

- [ ] **Step 6: Run to verify pass**

```bash
cd web
npm test -- --run lib/session-version.spec.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd web
git add lib/internal-auth.ts lib/internal-auth.spec.ts lib/session-version.ts lib/session-version.spec.ts
git commit -m "feat: export signInternalToken, add fetchSessionVersion (Epic 15 Story 2)"
```

---

### Task 6: `web` — wire session revocation into Auth.js's `jwt()` callback

**Files:**
- Create: `web/lib/session-jwt.ts`
- Create: `web/lib/session-jwt.spec.ts`
- Modify: `web/types/next-auth.d.ts`
- Modify: `web/auth.ts`

**Interfaces:**
- Consumes: `fetchSessionVersion` (Task 5, mocked in this task's own tests via `vi.mock("./session-version")`).
- Produces: `resolveSessionVersion(tokenVersion: number, result: SessionVersionResult): number | null` (pure). `handleJwtCallback(token: { id?: string; sessionVersion?: number }, user: { id: string; sessionVersion: number } | undefined): Promise<{ id: string; sessionVersion: number } | null>`. Consumed directly by `web/auth.ts`'s `jwt` callback.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/session-jwt.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchSessionVersionMock } = vi.hoisted(() => ({
  fetchSessionVersionMock: vi.fn(),
}));
vi.mock("./session-version", () => ({ fetchSessionVersion: fetchSessionVersionMock }));

import { resolveSessionVersion } from "./session-jwt";
import { handleJwtCallback } from "./session-jwt";

describe("resolveSessionVersion (pure)", () => {
  it("keeps the token version when the DB agrees", () => {
    expect(resolveSessionVersion(2, { status: "current", version: 2 })).toBe(2);
  });

  it("invalidates when the DB version has moved (sign-out-all-devices happened)", () => {
    expect(resolveSessionVersion(2, { status: "current", version: 3 })).toBeNull();
  });

  it("invalidates on not-found (user deleted)", () => {
    expect(resolveSessionVersion(2, { status: "not-found" })).toBeNull();
  });

  it("fails open (keeps the token version) when the check is unavailable", () => {
    expect(resolveSessionVersion(2, { status: "unavailable" })).toBe(2);
  });
});

describe("handleJwtCallback", () => {
  beforeEach(() => {
    fetchSessionVersionMock.mockReset();
  });

  it("on sign-in (user present), seeds the token from the user object without calling fetchSessionVersion", async () => {
    const result = await handleJwtCallback({}, { id: "7", sessionVersion: 5 });

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
    expect(fetchSessionVersionMock).not.toHaveBeenCalled();
  });

  it("on a subsequent request, checks the current version and keeps the session when it matches", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "current", version: 5 });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
    expect(fetchSessionVersionMock).toHaveBeenCalledWith("7");
  });

  it("returns null (invalidating the session) when the version has moved", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "current", version: 6 });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toBeNull();
  });

  it("returns null when the user has been deleted", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "not-found" });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toBeNull();
  });

  it("returns the token unchanged (fail open) when the check is unavailable", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "unavailable" });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
  });

  it("returns null for a token with no id and no incoming user (should never happen, but must not crash or loop)", async () => {
    const result = await handleJwtCallback({}, undefined);

    expect(result).toBeNull();
    expect(fetchSessionVersionMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd web
npm test -- --run lib/session-jwt.spec.ts
```

Expected: FAIL — module `./session-jwt` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `web/lib/session-jwt.ts`:

```typescript
import { fetchSessionVersion, type SessionVersionResult } from "./session-version";

// Pure decision function — no I/O, fully covered by direct unit tests.
// Kept separate from handleJwtCallback below specifically so the
// mismatch/not-found/unavailable branching can be tested without mocking
// fetch or the internal-auth signer.
export function resolveSessionVersion(
  tokenVersion: number,
  result: SessionVersionResult
): number | null {
  if (result.status === "not-found") return null;
  if (result.status === "unavailable") return tokenVersion;
  if (result.version !== tokenVersion) return null;
  return result.version;
}

type SessionToken = { id: string; sessionVersion: number };

// Orchestrates the actual DB check (fetchSessionVersion) with the pure
// decision above. Called from web/auth.ts's jwt() callback, which Auth.js
// (v5) invokes unconditionally on every request under the JWT session
// strategy (confirmed against next-auth's own session-handling source via
// context7 during planning) — returning null here is Auth.js's documented
// signal to drop the session (its own cookie-clearing behavior on a null
// jwt() result).
export async function handleJwtCallback(
  token: { id?: string; sessionVersion?: number },
  user: SessionToken | undefined
): Promise<SessionToken | null> {
  if (user) {
    return { id: user.id, sessionVersion: user.sessionVersion };
  }

  if (!token.id || typeof token.sessionVersion !== "number") {
    return null;
  }

  const result = await fetchSessionVersion(token.id);
  const resolvedVersion = resolveSessionVersion(token.sessionVersion, result);
  if (resolvedVersion === null) {
    return null;
  }

  return { id: token.id, sessionVersion: resolvedVersion };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd web
npm test -- --run lib/session-jwt.spec.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Type augmentation**

Edit `web/types/next-auth.d.ts` to its full new contents:

```typescript
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    sessionVersion: number;
  }
}
```

- [ ] **Step 6: Wire `handleJwtCallback` into `web/auth.ts`**

Edit `web/auth.ts`. Add an import at the top (after the existing `isPathAuthorized` import):

```typescript
import { handleJwtCallback } from "@/lib/session-jwt";
```

Replace the existing `jwt` callback (currently):

```typescript
    jwt({ token, user }) {
      // Finance API's user id is a Postgres integer; the JWT `sub`
      // claim (used later to sign the internal service-to-service
      // token) must be a string per the JWT spec, so normalize here.
      if (user) token.id = String(user.id);
      return token;
    },
```

with:

```typescript
    async jwt({ token, user }) {
      // Finance API's user id is a Postgres integer; the JWT `sub`
      // claim (used later to sign the internal service-to-service
      // token) must be a string per the JWT spec, so normalize here.
      // handleJwtCallback (Epic 15 Story 2, S04.3) also re-checks the
      // session's revocation version on every request beyond the initial
      // sign-in — returning null tells Auth.js to drop the session.
      const result = await handleJwtCallback(
        token,
        user ? { id: String(user.id), sessionVersion: user.sessionVersion } : undefined
      );
      if (result === null) return null;
      token.id = result.id;
      token.sessionVersion = result.sessionVersion;
      return token;
    },
```

- [ ] **Step 7: Verify the build**

```bash
cd web
npx tsc --noEmit
npm run build
```

Expected: both clean. This is the step that proves `import "server-only"` (transitively pulled in via `session-jwt.ts` → `session-version.ts` → `internal-auth.ts`) doesn't break `auth.ts`'s usage inside `proxy.ts` (Node.js runtime since Epic 7 S3 — verify this empirically here rather than assuming, per this project's standing habit whenever a server-only import crosses a new boundary).

- [ ] **Step 8: Run the full web test suite once**

```bash
cd web
npm test
```

Expected: no regressions (the existing `web/auth.spec.ts` source-inspection test is unaffected by this change — it only asserts the file doesn't define a custom `cookies` option).

- [ ] **Step 9: Commit**

```bash
cd web
git add lib/session-jwt.ts lib/session-jwt.spec.ts types/next-auth.d.ts auth.ts
git commit -m "feat: wire session-version revocation into Auth.js jwt() callback (Epic 15 Story 2, S04.3)"
```

---

### Task 7: "Sign out all devices" Server Action + Settings UI

**Files:**
- Modify: `web/app/actions.ts`
- Modify: `web/app/(dashboard)/settings/page.tsx`
- Modify: `web/app/(dashboard)/settings/page.module.css`
- Modify: `web/app/(dashboard)/settings/page.spec.tsx`

**Interfaces:**
- Consumes: `getAuthorizedHeaders` (existing), `FINANCE_API_URL` (existing), `extractApiErrorMessage` (existing), `signOut` from `@/auth` (existing import in `actions.ts`), `POST /users/me/sign-out-all-devices` (Task 3).
- Produces: `signOutAllDevicesAction(): Promise<void>` — a Server Action with no arguments, bindable directly to a `<form action={signOutAllDevicesAction}>` the same way `deleteAccountAction` is used with a form.

- [ ] **Step 1: Add the Server Action**

Edit `web/app/actions.ts`. Add at the end of the file, after `deleteAccountAction`:

```typescript
export async function signOutAllDevicesAction(): Promise<void> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/users/me/sign-out-all-devices`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not sign out other devices");
    redirect(`/settings?signOutError=${encodeURIComponent(message)}`);
  }

  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 2: Add the Settings UI section**

Edit `web/app/(dashboard)/settings/page.tsx`. Add `signOutAllDevicesAction` to the existing import from `@/app/actions` (currently `import { updateSettingsAction, deleteAccountAction } from "@/app/actions";`):

```typescript
import { updateSettingsAction, deleteAccountAction, signOutAllDevicesAction } from "@/app/actions";
```

Add a new `searchParams` read alongside the existing `deleteErrorMessage` (after that line):

```typescript
  const signOutErrorMessage =
    typeof searchParams.signOutError === "string" ? searchParams.signOutError : null;
```

Add a new section, placed between the existing "Forecast assumptions" `</section>` and the "Data" `<section>` (i.e. it becomes its own card, matching every other Settings card's `<section className={styles.sectionCard}>` shape):

```typescript
      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Sessions</h2>
        <p className={styles.note}>
          Sign out everywhere this account is currently logged in, including
          this device. You&apos;ll need to log in again afterward.
        </p>

        {signOutErrorMessage && <p className={styles.error}>{signOutErrorMessage}</p>}

        <form action={signOutAllDevicesAction}>
          <button type="submit" className={styles.deleteButton}>
            Sign out all devices
          </button>
        </form>
      </section>
```

(This reuses `styles.deleteButton` — same visual weight as "Delete account permanently," since both are destructive-to-the-current-session actions; no new CSS class needed, so `page.module.css` needs no edit despite being listed above as a candidate — confirm `.deleteButton` exists in that file before assuming this, since if it's scoped only under `.deleteSection` in the CSS the class may not render correctly standalone.)

- [ ] **Step 3: Verify `.deleteButton`'s CSS is not scoped to `.deleteSection`**

Read `web/app/(dashboard)/settings/page.module.css` and check whether `.deleteButton`'s rule is a bare `.deleteButton { ... }` or nested/qualified as `.deleteSection .deleteButton { ... }`. If it's bare, Step 2's reuse works unchanged. If it's qualified, add a standalone rule reusing the same declarations under a new selector (e.g. duplicate the block under a `.dangerButton` class, matching whatever declarations the existing `.deleteButton` rule has) and use that class name instead in Step 2's `<button>`.

- [ ] **Step 4: Update the page test's mocks and add a test**

Edit `web/app/(dashboard)/settings/page.spec.tsx`. In the existing `vi.mock("@/app/actions", ...)` block:

```typescript
vi.mock("@/app/actions", () => ({
  updateSettingsAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  signOutAllDevicesAction: vi.fn(),
}));
```

Add a new test near the file's existing assertions (match the file's existing `describe`/`it` structure and rendering pattern — render `<SettingsPage />` with `props.searchParams` resolved the same way existing tests do):

```typescript
  it("renders a Sign out all devices button in a Sessions section", async () => {
    const ui = await SettingsPage({
      searchParams: Promise.resolve({}),
    } as never);
    render(ui);

    expect(screen.getByRole("heading", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out all devices" })).toBeInTheDocument();
  });
```

(Match the exact `props.searchParams` invocation shape already used by this file's other tests — if the existing tests call `SettingsPage(props)` differently, e.g. via a shared `renderPage()` helper already defined in the file, use that helper instead of duplicating the shape here.)

- [ ] **Step 5: Run the test**

```bash
cd web
npm test -- --run "app/(dashboard)/settings/page.spec.tsx"
```

Expected: PASS, including the new test.

- [ ] **Step 6: Full verification**

```bash
cd web
npx tsc --noEmit
npm run build
npm test
```

Expected: all clean, no regressions.

- [ ] **Step 7: Commit**

```bash
cd web
git add app/actions.ts "app/(dashboard)/settings/page.tsx" "app/(dashboard)/settings/page.spec.tsx"
git commit -m "feat: sign-out-all-devices action + Settings UI (Epic 15 Story 2)"
```

---

### Task 8: Close the loop — `improvements.md`, `target-model.md`, full local verification

**Files:**
- Modify: `improvements.md`
- Modify: `docs/roadmap/2026-09-23-target-model.md`

**Interfaces:**
- None (documentation-only task).

- [ ] **Step 1: Check off S04.3**

Edit `improvements.md`. Find the line (in the "Identity and sessions" subsection of §8):

```
- [ ] S04.3 Define revocation for Auth.js JWT sessions using a checked session version or equivalent server-side state. Password reset, account deletion, and “sign out all devices” must invalidate prior sessions. Account for the remaining lifetime of any issued internal token.
```

Change to:

```
- [x] S04.3 Define revocation for Auth.js JWT sessions using a checked session version or equivalent server-side state. Password reset, account deletion, and “sign out all devices” must invalidate prior sessions. Account for the remaining lifetime of any issued internal token. **Done (Epic 15 Story 2, 2026-09-28):** `User.sessionVersion`, checked on every request via `web/auth.ts`'s `jwt()` callback against `GET /users/me/session-version`. "Sign out all devices" bumps it (`POST /users/me/sign-out-all-devices`) and immediately signs the caller out too. Account deletion needs no separate bump — a deleted user's version check 404s, which already invalidates. Password reset itself is Epic 24's scope (not built here); `UsersService.bumpSessionVersion` is the reusable hook that flow will call. Internal-token lifetime (the 30s `INTERNAL_API_SECRET`-signed service-to-service JWT, distinct from the Auth.js session) is unaffected by this mechanism and was already bounded by S04.2's short expiry — not touched by this story.
```

- [ ] **Step 2: Update `target-model.md`**

Edit `docs/roadmap/2026-09-23-target-model.md:22`, currently:

```
| Session version | Planned — Epic 15 Story 2 (session revocation on password change/delete/logout-all) |
```

Change to:

```
| Session version | Done — Epic 15 Story 2, 2026-09-28 (`User.sessionVersion`, checked in `web/auth.ts`'s `jwt()` callback; "sign out all devices" wired, password-change hook point ready for Epic 24) |
```

- [ ] **Step 3: Full local verification, both services**

```bash
cd finance-api && npm test && npm run test:e2e && npx tsc --noEmit && npm run lint
cd ../web && npm test && npx tsc --noEmit && npm run build && npm run lint
```

Expected: all clean. Record the actual pass counts (e.g. "finance-api unit N/N, e2e M/M, web P/P") in the commit message below — do not claim a count without having just run it.

- [ ] **Step 4: Commit**

```bash
git add improvements.md docs/roadmap/2026-09-23-target-model.md
git commit -m "docs: close S04.3 / Epic 15 Story 2 (session revocation)"
```

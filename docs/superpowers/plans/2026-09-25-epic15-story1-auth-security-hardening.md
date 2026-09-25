# Epic 15 Story 1 — Auth/Authz/Service-Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close `improvements.md` S04.1, S04.2, S04.4, S04.5, S04.8, S04.9,
S04.10, S04.11, S04.12, S04.13, S04.14, S04.15, S04.16 — startup secret
validation, JWT hardening, rate limiting, generic auth responses, ownership
verification, DB role docs, Analytics Service auth, CORS narrowing,
CSRF/cookie verification, report-only CSP, input-bounds + global exception
filter, and no-cache financial responses.

**Architecture:** No new services or data flow — this hardens the existing
boundaries between `web`, `finance-api`, and `analytics-service`. Every task
either tightens an existing check or adds a new, narrowly-scoped guard/
middleware at a boundary that's already there.

**Tech Stack:** `@nestjs/throttler@6.7.1` (new dependency, finance-api),
`jose@^6.2.12` (existing), `bcryptjs@^3.0.3` (existing), Next.js 16.3.4
`instrumentation.ts`/`proxy.ts` (existing pattern, extended), Auth.js
v5 beta.32 (existing, default cookie config verified, not reconfigured).

**Spec:** `docs/superpowers/specs/2026-09-25-epic15-auth-security-hardening-design.md`

## Global Constraints

- Money/date discipline holds: no new float arithmetic, no new `Date`
  object date math — this story touches auth/security, not money, but any
  test fixture using dates follows the existing raw-string convention.
- New dependency (`@nestjs/throttler`) pinned to an exact version
  (`6.7.1`, current stable `latest` on npm, not a range) — matches this
  project's Prisma/Recharts precedent of exact-pinning, never a caret
  range for a security-relevant dependency.
- Every new library API used below was verified against context7
  (jose 6, `@nestjs/throttler`, Auth.js v5, Next.js 16.3.4, bcryptjs) —
  do not deviate from the confirmed shapes without re-checking docs.
- `finance-api` and `analytics-service` are never called from the browser
  directly (BFF pattern, Epic 7 S3/S4) — every new guard/secret here
  protects a server-to-server boundary, not a public API.
- Two pre-existing **red** tests in this repo are this story's exact
  acceptance criteria for Task 2 — do not write new tests that duplicate
  them, make them pass:
  - `finance-api/src/auth/internal-auth.guard.spec.ts` — `F11a` (2 tests)
  - `finance-api/test/improvements-findings.e2e-spec.ts` — `F11c` (1 test)
  Confirmed red by running `npx vitest run src/auth/internal-auth.guard.spec.ts`
  in `finance-api/` before this plan was written (2/3 fail today).
- `F11d` (idempotency) and `F18` (import-commit trust) in the same e2e
  spec file are **out of scope** — they belong to `improvements.md` S05.4
  and S06 respectively, not S04. Do not touch them in this story.

---

### Task 1: Startup secret/env validation

**Files:**
- Create: `finance-api/src/common/validate-env.ts`
- Create: `finance-api/src/common/validate-env.spec.ts`
- Modify: `finance-api/src/main.ts`
- Create: `web/lib/validate-env.ts`
- Create: `web/lib/validate-env.spec.ts`
- Create: `web/instrumentation.ts`
- Create: `web/.env.example`

**Interfaces:**
- Produces: `validateEnv(env: NodeJS.ProcessEnv): void` (both `finance-api`
  and `web` copies — same shape, different required-key list) — throws
  `Error` with a message listing every missing key (never their values) if
  any required key is missing or an empty string. Later tasks that add new
  secrets (Task 7's `ANALYTICS_API_SECRET`) extend this list.

- [ ] **Step 1: Write the failing test for `finance-api`'s validator**

```typescript
// finance-api/src/common/validate-env.spec.ts
import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate-env.js';

describe('validateEnv (finance-api)', () => {
  const REQUIRED = ['DATABASE_URL', 'INTERNAL_API_SECRET'];

  it('does not throw when every required key is a non-empty string', () => {
    const env = { DATABASE_URL: 'postgresql://x', INTERNAL_API_SECRET: 'a-secret' };
    expect(() => validateEnv(env, REQUIRED)).not.toThrow();
  });

  it('throws listing every missing key, and never includes a value', () => {
    const env = { DATABASE_URL: 'postgresql://x', INTERNAL_API_SECRET: '' };
    expect(() => validateEnv(env, REQUIRED)).toThrow(/INTERNAL_API_SECRET/);
  });

  it('throws when a required key is entirely absent', () => {
    const env = { DATABASE_URL: 'postgresql://x' };
    expect(() => validateEnv(env, REQUIRED)).toThrow(/INTERNAL_API_SECRET/);
  });

  it('lists all missing keys in one error, not just the first', () => {
    const env = {};
    expect(() => validateEnv(env, REQUIRED)).toThrow(/DATABASE_URL.*INTERNAL_API_SECRET|INTERNAL_API_SECRET.*DATABASE_URL/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `finance-api/`): `npx vitest run src/common/validate-env.spec.ts`
Expected: FAIL — `validate-env.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// finance-api/src/common/validate-env.ts
export function validateEnv(
  env: Record<string, string | undefined>,
  requiredKeys: string[],
): void {
  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/validate-env.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Wire into `finance-api/src/main.ts`, before app creation**

```typescript
// finance-api/src/main.ts — add near the top of bootstrap(), before
// NestFactory.create
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { validateEnv } from './common/validate-env.js';

async function bootstrap() {
  validateEnv(process.env, ['DATABASE_URL', 'INTERNAL_API_SECRET']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' });
  app.enableCors();
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

(`ANALYTICS_API_SECRET` is not added to `finance-api`'s required list —
that secret belongs to `analytics-service` and `web`, not `finance-api`.)

- [ ] **Step 6: Manually verify fail-fast behavior**

Run: `INTERNAL_API_SECRET= npx tsx src/main.ts` (from `finance-api/`, with
`DATABASE_URL` set from your shell environment or `.env`)
Expected: process exits with the "Missing required environment
variable(s): INTERNAL_API_SECRET" error, never binds a port.

- [ ] **Step 7: Commit**

```bash
cd finance-api
git add src/common/validate-env.ts src/common/validate-env.spec.ts src/main.ts
git commit -m "feat: fail-fast startup validation for required secrets (S04.1)"
```

- [ ] **Step 8: Write the failing test for `web`'s validator**

```typescript
// web/lib/validate-env.spec.ts
import { describe, expect, it } from "vitest";
import { validateEnv } from "./validate-env";

describe("validateEnv (web)", () => {
  const REQUIRED = ["AUTH_SECRET", "INTERNAL_API_SECRET"];

  it("does not throw when every required key is a non-empty string", () => {
    expect(() =>
      validateEnv({ AUTH_SECRET: "a", INTERNAL_API_SECRET: "b" }, REQUIRED)
    ).not.toThrow();
  });

  it("throws listing a missing key", () => {
    expect(() =>
      validateEnv({ AUTH_SECRET: "a", INTERNAL_API_SECRET: "" }, REQUIRED)
    ).toThrow(/INTERNAL_API_SECRET/);
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run (from `web/`): `npx vitest run lib/validate-env.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 10: Write minimal implementation (identical shape to `finance-api`'s — deliberately not shared as a package, this project has no monorepo tooling to share code across `web`/`finance-api`, matches the existing precedent of independently reimplementing small pure helpers per service)**

```typescript
// web/lib/validate-env.ts
export function validateEnv(
  env: Record<string, string | undefined>,
  requiredKeys: string[]
): void {
  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npx vitest run lib/validate-env.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 12: Wire into `web/instrumentation.ts` (new file — confirmed via context7 that Next.js 16's `register()` hook is stable, no experimental flag needed)**

```typescript
// web/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/validate-env");
    validateEnv(process.env, [
      "AUTH_SECRET",
      "INTERNAL_API_SECRET",
      "ANALYTICS_API_SECRET",
    ]);
  }
}
```

(`ANALYTICS_API_SECRET` doesn't exist yet — it's added in Task 7. This
task's `register()` call already lists it so Task 7 doesn't have to touch
this file again; until Task 7 lands, anyone running `web` locally without
that var set will see the fail-fast error, which is correct — it's a new
required secret from this same story.)

- [ ] **Step 13: Create `web/.env.example` (no such file exists today — a real gap, `finance-api` has had one since Epic 7 S1)**

```
AUTH_SECRET="generate-with: npx auth secret"
INTERNAL_API_SECRET="generate-a-random-secret-and-put-it-here"
ANALYTICS_API_SECRET="generate-a-random-secret-and-put-it-here"
```

- [ ] **Step 14: Manually verify fail-fast behavior**

Run (from `web/`): `AUTH_SECRET= npm run build` then `npm start`
Expected: server throws the missing-variable error during startup and
never serves a request. (`npm run dev` also triggers `register()` — either
works for manual verification.)

- [ ] **Step 15: Commit**

```bash
cd web
git add lib/validate-env.ts lib/validate-env.spec.ts instrumentation.ts .env.example
git commit -m "feat: fail-fast startup validation for required secrets (S04.1)"
```

---

### Task 2: JWT hardening — algorithm/issuer/audience/positive-subject

Closes the two pre-existing red `F11a` tests in
`finance-api/src/auth/internal-auth.guard.spec.ts`.

**Files:**
- Modify: `finance-api/src/auth/internal-auth.guard.ts`
- Modify: `web/lib/internal-auth.ts`
- Test: `finance-api/src/auth/internal-auth.guard.spec.ts` (already exists,
  do not rewrite — only add the two new cases below; the file's 3 existing
  tests must all pass after this task)

**Interfaces:**
- Consumes: nothing new.
- Produces: `internal-auth.guard.ts` now rejects tokens missing `sub`, a
  non-positive-integer `sub`, wrong `iss`/`aud`, or an algorithm other than
  `HS256`. `web/lib/internal-auth.ts`'s `signInternalToken` now embeds
  `iss: "saldovio-web"` and `aud: "saldovio-finance-api"`.

- [ ] **Step 1: Confirm the two pre-existing tests currently fail**

Run (from `finance-api/`): `npx vitest run src/auth/internal-auth.guard.spec.ts`
Expected: FAIL — `F11a: accepts a correctly-signed token with no subject
claim` and `F11a: accepts a correctly-signed token with an unrelated
issuer/audience` both fail (promise resolves `true` instead of rejecting).
This confirms the plan's Global Constraints claim before you touch code.

- [ ] **Step 2: Add one more red test — non-positive/non-integer subject**

Append to `finance-api/src/auth/internal-auth.guard.spec.ts`, inside the
existing `describe` block, after the last `it`:

```typescript
  // improvements.md F11a (P0): Number(payload.sub) on a non-numeric or
  // non-positive subject (e.g. "-1", "abc", "0") should never resolve to
  // a usable user id.
  it('F11a: rejects a token whose subject is not a positive integer', async () => {
    const token = await signToken({ sub: '-1', issuer: 'saldovio-web', audience: 'saldovio-finance-api' });
    await expect(guard.canActivate(contextWithBearerToken(token))).rejects.toThrow();
  });
```

- [ ] **Step 3: Run tests to verify 3 failures now**

Run: `npx vitest run src/auth/internal-auth.guard.spec.ts`
Expected: FAIL — 3 of 4 tests fail (the new one plus the two pre-existing).

- [ ] **Step 4: Implement the hardened guard**

```typescript
// finance-api/src/auth/internal-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Request } from 'express';

const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
const ISSUER = 'saldovio-web';
const AUDIENCE = 'saldovio-finance-api';

// Verifies the short-lived JWT that web/ mints for every server-side
// call. This is the trust boundary: Finance API never accepts a
// caller-supplied userId directly (brief §12 — "never trust a userId
// sent by the browser"), only one signed with a secret only web/'s
// server-side code holds, with an expiry short enough that a captured
// token is useless by the time it could be replayed. Hardened per
// improvements.md F11a: explicit algorithm allowlist, issuer/audience
// binding, and a positive-integer subject requirement — a correctly
// signed but wrongly-shaped token (missing sub, wrong iss/aud, or a
// non-positive sub) is rejected the same as a badly-signed one.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { userId?: number }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing internal auth token');
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        requiredClaims: ['sub', 'iss', 'aud'],
      });

      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new UnauthorizedException('Invalid internal auth token subject');
      }

      request.userId = userId;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired internal auth token');
    }
  }
}
```

- [ ] **Step 5: Update `web/lib/internal-auth.ts` to sign matching claims**

```typescript
// web/lib/internal-auth.ts
import "server-only";
import { SignJWT } from "jose";
import { auth } from "@/auth";

// This module signs the internal, short-lived JWT that proves a
// request to Finance API really comes from web/'s server, acting on
// behalf of the currently logged-in user. `import "server-only"` makes
// the build fail if this ever gets imported into a Client Component —
// INTERNAL_API_SECRET must never reach the browser bundle. iss/aud are
// bound to finance-api's InternalAuthGuard (improvements.md F11a).
const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
const ISSUER = "saldovio-web";
const AUDIENCE = "saldovio-finance-api";

async function signInternalToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(secret);
}

export async function getAuthorizedHeaders(): Promise<HeadersInit> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const token = await signInternalToken(session.user.id);
  return { Authorization: `Bearer ${token}` };
}
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `npx vitest run src/auth/internal-auth.guard.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 7: Run the full finance-api unit suite to check for regressions**

Run: `npm test` (from `finance-api/`)
Expected: PASS, no regressions (every other guard-protected route's tests
sign tokens through the same `signInternalToken`-shaped helper or the
guard's own tested path).

- [ ] **Step 8: Run web's unit suite**

Run: `npm test` (from `web/`)
Expected: PASS — `internal-auth.ts` has no direct unit test today (it's
exercised indirectly through Server Action tests); confirm none of those
break from the added claims.

- [ ] **Step 9: Commit**

```bash
git add finance-api/src/auth/internal-auth.guard.ts finance-api/src/auth/internal-auth.guard.spec.ts web/lib/internal-auth.ts
git commit -m "fix: harden internal JWT verification — algorithm/issuer/audience/subject (S04.2, closes F11a)"
```

---

### Task 3: Rate limiting

Closes the pre-existing red `F11c` test in
`finance-api/test/improvements-findings.e2e-spec.ts`.

**Files:**
- Modify: `finance-api/package.json` (new dependency)
- Modify: `finance-api/src/app.module.ts`
- Modify: `finance-api/src/auth/auth.controller.ts`
- Modify: `finance-api/src/transactions/transactions.controller.ts`
- Modify: `finance-api/src/users/users.controller.ts`
- Test: `finance-api/test/improvements-findings.e2e-spec.ts` (existing,
  do not rewrite — only remove its `F11c` test's now-unnecessary
  "expected to fail" framing comment once it passes, see Step 5)

**Interfaces:**
- Produces: a global `ThrottlerGuard` bound via `APP_GUARD`, default
  100 requests/60s per IP; `@Throttle` overrides on `POST /auth/login`
  (5/60s — tight, matches the F11c test's 20-attempt burst), `POST
  /users` signup (5/60s), `POST /transactions/import/preview` and
  `/import/commit` (10/60s), `POST /transactions` (30/60s).

- [ ] **Step 1: Confirm the pre-existing F11c test currently fails**

Run (from `finance-api/`): `npx vitest run --config ./vitest.config.e2e.ts test/improvements-findings.e2e-spec.ts -t F11c`
Expected: FAIL — every one of the 20 attempts returns 401, none 429.

- [ ] **Step 2: Install `@nestjs/throttler`, pinned exact**

```bash
cd finance-api
npm install --save-exact @nestjs/throttler@6.7.1
```

- [ ] **Step 3: Wire `ThrottlerModule` + global `ThrottlerGuard` in `app.module.ts`**

```typescript
// finance-api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ClockModule } from './common/clock.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { RecurringRulesModule } from './recurring-rules/recurring-rules.module.js';

@Module({
  imports: [
    // In-memory storage (the default — no external store configured).
    // Every service is single-instance on free-tier hosting (Epic 12
    // S3, not yet deployed); revisit if a second instance ever exists
    // (improvements.md S04.4's "durable/shared limits for multiple
    // instances" note — not applicable to this deployment shape today).
    ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 100 }]),
    PrismaModule,
    ClockModule,
    TransactionsModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    RecurringRulesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [ ] **Step 4: Tighten limits on sensitive routes with `@Throttle`**

```typescript
// finance-api/src/auth/auth.controller.ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

```typescript
// finance-api/src/users/users.controller.ts — only the create() route changes
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(InternalAuthGuard)
  @Get('me/settings')
  getSettings(@CurrentUserId() userId: number) {
    return this.usersService.getSettings(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Patch('me/settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUserId() userId: number) {
    return this.usersService.updateSettings(userId, dto);
  }

  @UseGuards(InternalAuthGuard)
  @Delete('me')
  @HttpCode(204)
  deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUserId() userId: number) {
    return this.usersService.deleteAccount(userId, dto.password);
  }
}
```

```typescript
// finance-api/src/transactions/transactions.controller.ts — add @Throttle
// to the 3 write-heavy routes only; findAll/export stay at the global
// default (100/60s)
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUserId() userId: number) {
    return this.transactionsService.create(dto, userId);
  }

  // ... findAll unchanged ...

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('import/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  previewImport( /* unchanged params */ ) { /* unchanged body */ }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @Post('import/commit')
  commitImport(@Body() dto: ImportCommitDto, @CurrentUserId() userId: number) {
    return this.transactionsService.commitImport(dto.accountId, dto.rows, userId);
  }
```

Add `import { Throttle, seconds } from '@nestjs/throttler';` to
`transactions.controller.ts`'s existing import block.

- [ ] **Step 5: Run the F11c e2e test**

Run: `npx vitest run --config ./vitest.config.e2e.ts test/improvements-findings.e2e-spec.ts -t F11c`
Expected: PASS — one of the 20 attempts returns 429.

- [ ] **Step 6: Run the full e2e suite (rate limiting touches shared global state — verify no other e2e test starts colliding with the new limits)**

Run: `npm run test:e2e`
Expected: PASS. If any other e2e test now hits 429 unexpectedly (e.g. a
test that calls `POST /transactions` many times in a loop), that test's
own limit-sensitive calls need to either space out or the test needs its
own note — do not raise the global/tightened limits just to make an
unrelated test pass; investigate which is actually correct first.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 8: Write a rate-limit reset test (fault-injection standard — actually trigger the reset, not just assert the code path by inspection)**

```typescript
// finance-api/test/rate-limit-reset.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('rate limit resets after its window (S04.4)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'a 6th login attempt within 60s is 429; after the window, attempts succeed again',
    async () => {
      const email = `rate-limit-reset-${Date.now()}@example.com`;
      await prisma.user.create({
        data: { email, passwordHash: await bcrypt.hash('correct-password-123', 10) },
      });

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'wrong-password' });
      }
      const sixth = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' });
      expect(sixth.status).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 61_000));

      const afterWindow = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-password-123' });
      expect(afterWindow.status).toBe(200);

      await prisma.user.delete({ where: { email } });
    },
    70_000,
  );
});
```

- [ ] **Step 9: Run the new test**

Run: `npx vitest run --config ./vitest.config.e2e.ts test/rate-limit-reset.e2e-spec.ts`
Expected: PASS (takes ~61s — this is a real clock-time test, not
clock-mocked, deliberately proving the window actually elapses).

- [ ] **Step 10: Commit**

```bash
git add finance-api/package.json finance-api/package-lock.json finance-api/src/app.module.ts finance-api/src/auth/auth.controller.ts finance-api/src/users/users.controller.ts finance-api/src/transactions/transactions.controller.ts finance-api/test/rate-limit-reset.e2e-spec.ts
git commit -m "feat: rate limiting on login/signup/import/transaction routes (S04.4, closes F11c)"
```

---

### Task 4: Generic auth responses + bcrypt byte-limit

**Files:**
- Modify: `finance-api/src/auth/auth.service.ts`
- Modify: `finance-api/src/users/users.service.ts`
- Modify: `finance-api/src/auth/dto/login.dto.ts`
- Modify: `finance-api/src/users/dto/create-user.dto.ts`
- Test: `finance-api/src/auth/auth.service.spec.ts` (existing, extend)
- Test: `finance-api/src/users/users.service.spec.ts` (existing, extend)

**Interfaces:**
- Produces: both `AuthService.login` and `UsersService.create` reject a
  password that `bcrypt.truncates()` reports as too long, with a 400
  before ever calling `bcrypt.hash`/`bcrypt.compare` — closes the "never
  silently truncate" requirement (confirmed via context7:
  `bcrypt.truncates(password: string): boolean`, true above 72 UTF-8
  bytes).

- [ ] **Step 1: Read the existing DTOs to confirm current password field shape**

Run: `cat finance-api/src/auth/dto/login.dto.ts finance-api/src/users/dto/create-user.dto.ts`
(No test step here — this is a read-before-edit check, not a code change.)

- [ ] **Step 2: Write the failing test for the DTO-level length guard**

```typescript
// finance-api/src/users/dto/create-user.dto.spec.ts — add this case to
// the existing file (do not remove any existing test)
  it('rejects a password bcrypt would truncate (>72 UTF-8 bytes)', () => {
    const tooLong = 'a'.repeat(73);
    const result = CreateUserDto.schema.safeParse({
      email: 'test@example.com',
      password: tooLong,
    });
    expect(result.success).toBe(false);
  });
```

(If `create-user.dto.spec.ts` does not already expose `CreateUserDto.schema`
for direct parsing, check the file's existing test pattern first — every
DTO test file added since Sprint 7 S2's Zod migration parses via
`.schema.safeParse` or an equivalent already established in that file;
match whatever the file already does rather than introducing a second
pattern.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/users/dto/create-user.dto.spec.ts`
Expected: FAIL — a 73-byte password currently passes validation.

- [ ] **Step 4: Add the length check to both DTOs**

Both `login.dto.ts` and `create-user.dto.ts` define their `password`
field with `nestjs-zod`'s `z.string()`. Add a `.refine()` using
`bcrypt.truncates`:

```typescript
// finance-api/src/users/dto/create-user.dto.ts — password field becomes:
import bcrypt from 'bcryptjs';
// ... existing imports ...

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(1)
    .refine((value) => !bcrypt.truncates(value), {
      message: 'Password exceeds the maximum supported length',
    }),
});
```

Apply the identical `.refine()` to `login.dto.ts`'s password field — a
too-long password at login should also be rejected before `bcrypt.compare`
runs, not just at signup (login's existing "Invalid credentials" generic
message already covers what the user sees; the DTO-level 400 here is a
distinct, earlier rejection point for a structurally invalid request, not
a credentials check).

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/users/dto/create-user.dto.spec.ts src/auth/dto/login.dto.spec.ts`
Expected: PASS. (If `login.dto.spec.ts` doesn't exist yet, create it
mirroring `create-user.dto.spec.ts`'s new case — same `.refine()`, same
73-byte fixture.)

- [ ] **Step 6: Add a timing-difference note test (documents intent, not a strict timing assertion — real wall-clock timing tests are flaky by nature; this verifies the *mechanism* that keeps timing close, not a specific millisecond bound)**

```typescript
// finance-api/src/auth/auth.service.spec.ts — add to the existing file
  it('compares against a real bcrypt hash even when the email does not exist, so response time does not leak which emails are registered', async () => {
    // AuthService.login must call bcrypt.compare (or an equivalent-cost
    // operation) on the unknown-email path too, not short-circuit
    // straight to the UnauthorizedException — otherwise a missing user
    // returns near-instantly while a wrong password takes a real bcrypt
    // round, and the difference is measurable.
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    await expect(
      service.login({ email: 'definitely-not-registered@example.com', password: 'anything' }),
    ).rejects.toThrow('Invalid credentials');
    expect(compareSpy).toHaveBeenCalled();
  });
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run src/auth/auth.service.spec.ts`
Expected: FAIL — `AuthService.login` currently throws before calling
`bcrypt.compare` when the user doesn't exist (early return on `!user`).

- [ ] **Step 8: Fix `AuthService.login` to always pay the bcrypt cost**

```typescript
// finance-api/src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

// A hash of a password nobody will ever type — used only so the
// unknown-email path still pays a real bcrypt.compare cost, closing the
// timing side-channel that would otherwise let an attacker distinguish
// "no such email" (fast) from "wrong password" (slow) by response time.
const DUMMY_HASH = await bcrypt.hash('not-a-real-password-used-only-for-timing', 10);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Same "invalid credentials" message whether the email doesn't exist
    // or the password is wrong — distinguishing the two would let an
    // attacker enumerate registered emails. bcrypt.compare always runs,
    // against a dummy hash when there's no real user, so the two paths
    // also cost the same amount of time.
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email };
  }
}
```

- [ ] **Step 9: Run tests to verify pass**

Run: `npx vitest run src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 10: Run the full finance-api suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add finance-api/src/auth/auth.service.ts finance-api/src/auth/auth.service.spec.ts finance-api/src/auth/dto/login.dto.ts finance-api/src/users/dto/create-user.dto.ts finance-api/src/users/dto/create-user.dto.spec.ts finance-api/src/auth/dto/login.dto.spec.ts
git commit -m "fix: reject bcrypt-truncated passwords, close login timing side-channel (S04.5)"
```

---

### Task 5: Ownership-verification negative-path test suite

**Files:**
- Test: `finance-api/test/ownership-boundaries.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: `signInternalToken` (copy the helper already defined at the
  top of `finance-api/test/improvements-findings.e2e-spec.ts` — this
  project's existing pattern is one local copy per e2e file, not a shared
  test-helpers module; match that, don't introduce a new shared file).
- Produces: nothing new — this task only adds tests proving what
  Task-1-through-4's audit (see spec, "Current-state audit") found: every
  controller already enforces ownership via `@UseGuards(InternalAuthGuard)`
  plus a `where: { id, userId }` (or equivalent) scoping clause in the
  service. This task's job is proving it, not building it.

- [ ] **Step 1: Write the full negative-path suite (all tests below should currently PASS — this task adds coverage, it does not fix a bug; if any of them fails, STOP and report which one before continuing, since that would mean the "Current-state audit" in the spec was wrong)**

```typescript
// finance-api/test/ownership-boundaries.e2e-spec.ts
// Proves brief §12's rule directly: user B cannot read or write user A's
// resources by guessing/reusing an ID. Every case below is expected to
// PASS already — the guard + service-level `where: { id, userId }`
// pattern has been in place since Epic 7 S4 — this suite closes
// improvements.md S04.8/9 by making that a tested guarantee instead of
// an assumed one.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function signInternalToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('saldovio-web')
    .setAudience('saldovio-finance-api')
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(secret);
}

describe('ownership boundaries (S04.8/9)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userA: { id: number };
  let userB: { id: number };
  let accountA: { id: number };
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const suffix = Date.now();
    userA = await prisma.user.create({
      data: { email: `ownership-a-${suffix}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    userB = await prisma.user.create({
      data: { email: `ownership-b-${suffix}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    accountA = await prisma.account.create({
      data: {
        name: "A's account",
        currentBalance: '0',
        referenceDate: new Date('2026-01-01'),
        openingBoundary: 'start_of_day',
        userId: userA.id,
      },
    });
    tokenB = await signInternalToken(String(userB.id));
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { accountId: accountA.id } });
    await prisma.recurringRule.deleteMany({ where: { accountId: accountA.id } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await app.close();
  });

  it('user B cannot PATCH user A\'s account', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/accounts/${accountA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Renamed by B' });
    expect(res.status).toBe(403);
  });

  it('user B cannot PATCH user A\'s account flags', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/accounts/${accountA.id}/flags`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ archived: true });
    expect(res.status).toBe(403);
  });

  it('user B cannot create a transaction against user A\'s account', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        accountId: accountA.id,
        type: 'expense',
        amount: -10,
        occurredOn: '2026-01-15',
        category: 'Test',
      });
    expect(res.status).toBe(403);
  });

  it('user B\'s GET /transactions never includes user A\'s rows', async () => {
    await prisma.transaction.create({
      data: {
        accountId: accountA.id,
        type: 'expense',
        amount: '-10',
        occurredOn: new Date('2026-01-15'),
        category: 'A only',
        lifecycle: 'actual',
      },
    });
    const res = await request(app.getHttpServer())
      .get('/transactions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.some((t: { category: string }) => t.category === 'A only')).toBe(false);
  });

  it('user B cannot create a recurring rule against user A\'s account', async () => {
    const res = await request(app.getHttpServer())
      .post('/recurring-rules')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accountId: accountA.id, type: 'expense', amount: 50, frequency: 'monthly', dayOfMonth: 1, active: true });
    expect(res.status).toBe(403);
  });

  it('GET /accounts/me for user B never includes user A\'s account', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.some((a: { id: number }) => a.id === accountA.id)).toBe(false);
  });

  it('GET /users/me/settings for user B never reflects user A\'s data (scoped by token subject, not request body)', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me/settings')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    // No accountId/userId is accepted from the client on this route at
    // all — the only assertion possible here is that it succeeds scoped
    // to B's own token, proving the route has no body/query override.
  });
});
```

- [ ] **Step 2: Run the new suite**

Run (from `finance-api/`): `npx vitest run --config ./vitest.config.e2e.ts test/ownership-boundaries.e2e-spec.ts`
Expected: PASS, all 7 tests. If anything fails, stop and report — do not
"fix" a service to make this task's tests pass without first confirming
with the user, since this task is specified as verification-only.

- [ ] **Step 3: Commit**

```bash
git add finance-api/test/ownership-boundaries.e2e-spec.ts
git commit -m "test: ownership-boundary negative-path suite across all resources (S04.8/9)"
```

---

### Task 6: DB credential/role separation documentation

**Files:**
- Modify: `docs/local-development.md`
- Create: `docs/deploy-db-roles.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Read the existing `docs/local-development.md` to avoid duplicating its content**

Run: `cat docs/local-development.md`

- [ ] **Step 2: Add a short section confirming dev/test/demo separation (already true in practice — this step documents it, doesn't change it)**

Append to `docs/local-development.md`:

```markdown
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
```

- [ ] **Step 3: Create `docs/deploy-db-roles.md`, documenting the not-yet-enforced gap explicitly rather than silently**

```markdown
# Database role separation (deploy-time, not yet enforced)

Local development uses one Postgres role (the machine's own superuser,
via Postgres.app) for every database and every operation — migrations
and runtime queries alike. This is fine locally; it is not the target
shape for a deployed environment.

**Target, once Epic 12 S3 actually deploys to Neon:** a runtime role
scoped to `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `finance-api`'s own
tables only, separate from a migration role with `CREATE`/`ALTER`
privileges used only by `npx prisma migrate deploy`. `DATABASE_URL` in
Render's environment would use the runtime role; a separate
`MIGRATION_DATABASE_URL`, used only in the pre-deploy migration step,
would use the migration role.

**Known gap, not fixed here:** whether Neon's free tier supports
creating more than one role per project is unconfirmed — this needs
checking against Neon's current docs when Epic 12 S3 actually executes,
not assumed now. If the free tier only supports one role, the honest
fallback is documenting that limitation in `docs/deploy.md` rather than
claiming role separation that doesn't exist.
```

- [ ] **Step 4: Commit**

```bash
git add docs/local-development.md docs/deploy-db-roles.md
git commit -m "docs: database credential/role separation, dev/test/demo + deploy-time gap (S04.10)"
```

---

### Task 7: Analytics Service shared-secret auth

**Files:**
- Modify: `analytics-service/main.py`
- Create: `analytics-service/auth.py`
- Create: `analytics-service/test_auth.py`
- Modify: `web/lib/config.ts`
- Modify: `web/lib/analytics.ts`
- Modify: `web/.env.example` (from Task 1)

**Interfaces:**
- Produces: `analytics-service/auth.py`'s `verify_shared_secret(header:
  str | None) -> None` (raises `HTTPException(401)` on missing/wrong
  value), applied to `POST /forecast` via FastAPI's `Depends`.
  `web/lib/analytics.ts`'s `getForecast` sends `X-Analytics-Secret` on
  every call.

- [ ] **Step 1: Write the failing test**

```python
# analytics-service/test_auth.py
import os
from fastapi.testclient import TestClient

os.environ.setdefault("ANALYTICS_API_SECRET", "test-secret-value")

from main import app  # noqa: E402  (env var must be set before import)

client = TestClient(app)

VALID_REQUEST_BODY = {
    "currentBalance": "100.00",
    "recurringRules": [],
    "calculationDate": "2026-01-01",
    "windowEndDate": "2026-01-31",
}


def test_forecast_without_secret_header_is_rejected():
    response = client.post("/forecast", json=VALID_REQUEST_BODY)
    assert response.status_code == 401


def test_forecast_with_wrong_secret_is_rejected():
    response = client.post(
        "/forecast",
        json=VALID_REQUEST_BODY,
        headers={"X-Analytics-Secret": "not-the-real-secret"},
    )
    assert response.status_code == 401


def test_forecast_with_correct_secret_succeeds():
    response = client.post(
        "/forecast",
        json=VALID_REQUEST_BODY,
        headers={"X-Analytics-Secret": "test-secret-value"},
    )
    assert response.status_code == 200


def test_health_check_still_requires_no_auth():
    response = client.get("/")
    assert response.status_code == 200
```

- [ ] **Step 2: Run to verify it fails**

Run (from `analytics-service/`, with venv active):
`pytest test_auth.py -v`
Expected: FAIL — `/forecast` currently accepts requests with no header.

- [ ] **Step 3: Implement `auth.py`**

```python
# analytics-service/auth.py
"""Shared-secret check for POST /forecast — Analytics Service has no
concept of user identity (it's a stateless calculator, per CLAUDE.md),
so this isn't per-user auth, only a check that the caller is really
web/'s server and not an open, unauthenticated public endpoint
(improvements.md S04.11). A separate secret from finance-api's
INTERNAL_API_SECRET — a leak of one must not compromise the other.
"""

import os

from fastapi import Header, HTTPException

_SECRET = os.environ["ANALYTICS_API_SECRET"]


def verify_shared_secret(x_analytics_secret: str | None = Header(default=None)) -> None:
    if x_analytics_secret != _SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing analytics secret")
```

- [ ] **Step 4: Wire into `main.py`**

```python
# analytics-service/main.py
from fastapi import Depends, FastAPI

from auth import verify_shared_secret
from forecast import ForecastRequest, ForecastResponse, compute_forecast

app = FastAPI(title="Saldovio Analytics Service")


@app.get("/")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/forecast", dependencies=[Depends(verify_shared_secret)])
async def forecast(request: ForecastRequest) -> ForecastResponse:
    return compute_forecast(request)
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest test_auth.py -v`
Expected: PASS (4/4).

- [ ] **Step 6: Run the full Python suite for regressions**

Run: `pytest`
Expected: PASS. `test_forecast.py`'s existing tests call
`compute_forecast` directly (not through the HTTP layer, confirmed by
Sprint 6's own test description) — they should be unaffected, but verify.

- [ ] **Step 7: Add `ANALYTICS_API_SECRET` requirement to `web/lib/config.ts`**

```typescript
// web/lib/config.ts
// Local dev only — becomes env vars once this ever deploys
// somewhere other than localhost.
export const FINANCE_API_URL = "http://localhost:3000";
export const ANALYTICS_SERVICE_URL = "http://localhost:8000";
export const ANALYTICS_API_SECRET = process.env.ANALYTICS_API_SECRET ?? "";
```

- [ ] **Step 8: Send the header from `web/lib/analytics.ts`**

```typescript
// web/lib/analytics.ts
import "server-only";
import { ANALYTICS_SERVICE_URL, ANALYTICS_API_SECRET } from "./config";
import type { RecurringRule } from "./recurring-rules";

// ... DailyBalance/Forecast types and todayDateString() unchanged ...

export async function getForecast(
  currentBalance: string,
  recurringRules: RecurringRule[],
  windowEndDate: string
): Promise<Forecast> {
  const response = await fetch(`${ANALYTICS_SERVICE_URL}/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Analytics-Secret": ANALYTICS_API_SECRET,
    },
    cache: "no-store",
    body: JSON.stringify({
      currentBalance,
      recurringRules: recurringRules.map((rule) => ({
        type: rule.type,
        amount: rule.amount,
        dayOfMonth: rule.day_of_month,
      })),
      calculationDate: todayDateString(),
      windowEndDate,
    }),
  });

  if (!response.ok) {
    throw new Error(`Analytics Service returned ${response.status}`);
  }

  return response.json();
}
```

(`ANALYTICS_API_SECRET` was already added to `web/instrumentation.ts`'s
required-vars list in Task 1, Step 12 — no change needed there.)

- [ ] **Step 9: Add a `web` test confirming the header is sent**

Check whether `web/lib/analytics.spec.ts` already exists (it may not —
`getForecast` has been tested indirectly through page-level mocks so
far, per the progress log). If it doesn't exist, create it:

```typescript
// web/lib/analytics.spec.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("getForecast", () => {
  beforeEach(() => {
    vi.stubEnv("ANALYTICS_API_SECRET", "test-secret");
  });

  it("sends the shared secret header on every call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        forecastBalance: "0",
        calculationDate: "2026-01-01",
        windowEndDate: "2026-01-31",
        formulaVersion: "1.0",
        assumptions: [],
        dailyBalances: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getForecast } = await import("./analytics");
    await getForecast("100.00", [], "2026-01-31");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Analytics-Secret": "test-secret" }),
      })
    );
  });
});
```

- [ ] **Step 10: Run to verify it passes**

Run (from `web/`): `npx vitest run lib/analytics.spec.ts`
Expected: PASS.

- [ ] **Step 11: Update `finance-api/.env.demo.example` / local demo docs if `analytics-service` needs its own `.env.example` (it doesn't have one today)**

Check: `ls analytics-service/*.env* analytics-service/.env.example 2>/dev/null`
If no `.env.example` exists in `analytics-service/`, create one:

```
ANALYTICS_API_SECRET="generate-a-random-secret-and-put-it-here"
```

- [ ] **Step 12: Manually verify end to end**

With `finance-api`, `analytics-service` (with `ANALYTICS_API_SECRET` set
in its shell env), and `web` (with a matching `ANALYTICS_API_SECRET` in
`.env.local`) all running locally, load the dashboard in a browser and
confirm the forecast section still renders — the secret must match
across both services or the forecast card will show "Forecast
unavailable" (the existing fault-isolation path from Sprint 6, now also
covering an auth mismatch, not just service downtime).

- [ ] **Step 13: Commit**

```bash
git add analytics-service/main.py analytics-service/auth.py analytics-service/test_auth.py analytics-service/.env.example web/lib/config.ts web/lib/analytics.ts web/lib/analytics.spec.ts
git commit -m "feat: shared-secret auth on Analytics Service POST /forecast (S04.11)"
```

---

### Task 8: CORS narrowing

**Files:**
- Modify: `finance-api/src/main.ts`
- Test: `finance-api/test/cors.e2e-spec.ts` (new)

**Interfaces:**
- Consumes: a new env var `WEB_ORIGIN` (defaults to
  `http://localhost:3001` for local dev — matches the port `web/`'s dev
  server actually runs on today per the progress log, since 3000 is
  taken by `finance-api`).
- Produces: `finance-api`'s CORS config now allowlists only `WEB_ORIGIN`
  (plus `http://localhost:3001` always, for local dev convenience even
  when `WEB_ORIGIN` is set to a production value) instead of `origin:
  true`.

- [ ] **Step 1: Write the failing test**

```typescript
// finance-api/test/cors.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('CORS (S04.12)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.enableCors({ origin: ['http://localhost:3001'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reflects the allowlisted origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });

  it('does not reflect an arbitrary origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });
});
```

(This test instantiates its own app with the target CORS config directly,
rather than importing `main.ts`'s `bootstrap()` — `main.ts` isn't
structured as an exported, testable function today, and restructuring it
is out of scope for this task. Step 3 below still requires manually
verifying the real `main.ts` wiring, since this test alone can't prove
`main.ts` uses the same config.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config ./vitest.config.e2e.ts test/cors.e2e-spec.ts`
Expected: the first test passes trivially (any config reflecting the
origin would), the second currently would also pass since this test
builds its own restricted app — this test is checking the *pattern*
works, not yet checking `main.ts`. Proceed to Step 3 regardless; the real
verification of `main.ts` itself is the manual check in Step 4.

- [ ] **Step 3: Update `main.ts`**

```typescript
// finance-api/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { validateEnv } from './common/validate-env.js';

async function bootstrap() {
  validateEnv(process.env, ['DATABASE_URL', 'INTERNAL_API_SECRET']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' });

  // Narrowed from origin:true (improvements.md S04.12) — finance-api is
  // never called from the browser (BFF pattern since Epic 7 S3/S4), so
  // this isn't the real security boundary, but an open wildcard is
  // still worth closing now that this epic owns it (Epic 12's own
  // design doc parked this exact decision for "this epic").
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
  const allowedOrigins = new Set([webOrigin, 'http://localhost:3001']);
  app.enableCors({ origin: [...allowedOrigins] });

  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

- [ ] **Step 4: Manually verify against the real server**

Run (from `finance-api/`): `npm run start:dev`, then in another terminal:

```bash
curl -i -X OPTIONS http://localhost:3000/auth/login \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected: no `Access-Control-Allow-Origin: https://evil.example.com` in
the response headers. Repeat with `-H "Origin: http://localhost:3001"` and
confirm that one *is* reflected.

- [ ] **Step 5: Run the full e2e and unit suites**

Run: `npm test && npm run test:e2e`
Expected: PASS, no regressions (existing e2e tests use `supertest`
directly against the Nest testing module, not real cross-origin browser
requests, so they're unaffected by this change).

- [ ] **Step 6: Commit**

```bash
git add finance-api/src/main.ts finance-api/test/cors.e2e-spec.ts
git commit -m "fix: narrow finance-api CORS to an explicit origin allowlist (S04.12)"
```

---

### Task 9: CSRF/cookie/redirect verification + Server Actions origin allowlist

**Files:**
- Modify: `web/next.config.ts`
- Test: `web/auth.spec.ts` (new, or extend if a file already covers `web/auth.ts`)

**Interfaces:** none new — this task verifies existing Auth.js v5 default
cookie behavior (confirmed via context7: `httpOnly`, `sameSite: "lax"`,
`secure` auto-derived from HTTPS, `__Host-`/`__Secure-` prefixes applied
automatically) and adds Next.js's documented `serverActions.allowedOrigins`
config for defense-in-depth behind a future reverse proxy (Epic 12 S3's
Vercel/Render split means `web`'s own Origin header should always be
same-origin already, but a proxy could rewrite it — confirmed via context7
this is exactly the documented use case for this option).

- [ ] **Step 1: Write a test asserting default cookie security properties**

```typescript
// web/auth.spec.ts
import { describe, expect, it } from "vitest";

// Auth.js v5's own defaultCookies() (packages/core/src/lib/utils/cookie.ts)
// derives httpOnly/sameSite/secure automatically from whether the app is
// served over HTTPS — nothing in web/auth.ts overrides this, and this
// test exists to make sure nobody adds an override later without it
// being a deliberate, reviewed change (S04.13).
describe("auth.ts cookie configuration", () => {
  it("does not define a custom `cookies` option (relies on Auth.js v5's secure defaults)", async () => {
    const authModuleSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./auth.ts", import.meta.url), "utf-8")
    );
    expect(authModuleSource).not.toMatch(/cookies\s*:/);
  });
});
```

- [ ] **Step 2: Run to verify it passes (this documents current-correct state, it isn't expected to fail)**

Run (from `web/`): `npx vitest run auth.spec.ts`
Expected: PASS — `web/auth.ts` has no `cookies` override today (confirmed
by reading the file during spec-writing). If this fails, that means a
`cookies` override was added since this plan was written — stop and
report rather than deleting the override to make the test pass.

- [ ] **Step 3: Add `serverActions.allowedOrigins` to `next.config.ts`**

```typescript
// web/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches finance-api's own CSV upload cap exactly (main.ts's
      // useBodyParser('json', { limit: '5mb' }) and
      // transactions.controller.ts's MAX_UPLOAD_BYTES) — Server
      // Actions default to a 1MB body limit, which previewImportAction
      // would hit on any real statement file well before Finance API's
      // own limit ever applied.
      bodySizeLimit: "5mb",
      // Next.js already rejects a Server Action request whose Origin
      // header doesn't match the app's own host by default (confirmed
      // via context7's data-security.mdx) — this option is additive,
      // for the case where a reverse proxy sits in front (Epic 12 S3's
      // Vercel/Render deploy) and the app's externally-visible origin
      // differs from what Next.js sees internally. Left empty until S3
      // actually deploys and the real production hostname is known;
      // documented here so it isn't forgotten (improvements.md S04.13).
      allowedOrigins:
        process.env.WEB_PUBLIC_ORIGIN !== undefined
          ? [process.env.WEB_PUBLIC_ORIGIN]
          : undefined,
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run the full web suite and a production build**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean, no regressions. `WEB_PUBLIC_ORIGIN` is unset in every
environment today, so `allowedOrigins` resolves to `undefined` (Next.js's
own default, same-origin-only check) — this step should be behaviorally
a no-op until Epic 12 S3 sets that var.

- [ ] **Step 5: Commit**

```bash
git add web/auth.spec.ts web/next.config.ts
git commit -m "test: verify Auth.js default cookie security, add Server Actions allowedOrigins hook (S04.13)"
```

---

### Task 10: Security headers + CSP (report-only)

Deliberately does **not** touch `web/proxy.ts`. `proxy.ts` today is
`export { auth as proxy } from "@/auth";` — Next.js invokes `auth` itself
as the middleware, which is what runs `web/auth.ts`'s `authorized`
callback (layer 1's redirect logic). Rewriting `proxy.ts` to wrap `auth`
in a custom callback (`auth((req) => {...})`) changes how that callback's
return value composes with layer-1 redirects — confirmed via context7
that Auth.js v5's wrapped form is meant for writing your *own* redirect
logic, not for layering extra behavior on top of the existing
`authorized` callback — a real risk of silently breaking layer-1
protection (the exact class of regression `proxy.spec.ts`'s existing
export-name test was written to catch, per Epic 8 Story 3). Static
response headers don't need middleware at all: Next.js's documented,
stable `headers()` config in `next.config.ts` (confirmed via context7)
applies headers by path pattern with zero interaction with `proxy.ts` or
`auth`.

**Files:**
- Modify: `web/next.config.ts`
- Test: `web/next.config.spec.ts` (new)

**Interfaces:**
- Produces: `next.config.ts`'s `headers()` now returns
  `Content-Security-Policy-Report-Only`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `X-Frame-Options: DENY` for every path.

- [ ] **Step 1: Write the failing test**

```typescript
// web/next.config.spec.ts
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config headers() (S04.14)", () => {
  it("applies report-only CSP and baseline security headers to every path", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeDefined();
    const rules = await headersFn!();
    const allPaths = rules.find((rule) => rule.source === "/:path*");
    expect(allPaths).toBeDefined();

    const headerNames = allPaths!.headers.map((h) => h.key);
    expect(headerNames).toContain("Content-Security-Policy-Report-Only");
    expect(headerNames).toContain("X-Content-Type-Options");
    expect(headerNames).toContain("Referrer-Policy");
    expect(headerNames).toContain("X-Frame-Options");

    const xfo = allPaths!.headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
    const xcto = allPaths!.headers.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto?.value).toBe("nosniff");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `web/`): `npx vitest run next.config.spec.ts`
Expected: FAIL — `next.config.ts` has no `headers()` export today.

- [ ] **Step 3: Implement `headers()` in `next.config.ts`**

```typescript
// web/next.config.ts
import type { NextConfig } from "next";

// CSP is report-only in this story (improvements.md S04.14) — no
// directive here can break production rendering (Recharts,
// foreignObject tick labels in ForecastChartLine) since nothing is
// blocked yet, only reported. Enforcement mode is a future story once
// report data confirms the allowlist is complete.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches finance-api's own CSV upload cap exactly (main.ts's
      // useBodyParser('json', { limit: '5mb' }) and
      // transactions.controller.ts's MAX_UPLOAD_BYTES) — Server
      // Actions default to a 1MB body limit, which previewImportAction
      // would hit on any real statement file well before Finance API's
      // own limit ever applied.
      bodySizeLimit: "5mb",
      // Next.js already rejects a Server Action request whose Origin
      // header doesn't match the app's own host by default (confirmed
      // via context7's data-security.mdx) — this option is additive,
      // for the case where a reverse proxy sits in front (Epic 12 S3's
      // Vercel/Render deploy) and the app's externally-visible origin
      // differs from what Next.js sees internally. Left empty until S3
      // actually deploys and the real production hostname is known;
      // documented here so it isn't forgotten (improvements.md S04.13).
      allowedOrigins:
        process.env.WEB_PUBLIC_ORIGIN !== undefined
          ? [process.env.WEB_PUBLIC_ORIGIN]
          : undefined,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

(This task and Task 9 both touch `next.config.ts`; if Task 9 ran first,
merge into its existing `experimental.serverActions` block rather than
duplicating it — the snippet above already shows the merged final
shape.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run next.config.spec.ts`
Expected: PASS.

- [ ] **Step 5: Manually verify headers on a real response**

Run (from `web/`): `npm run build && npm start`, then:

```bash
curl -sI http://localhost:3001/login | grep -i "content-security-policy-report-only\|x-frame-options\|x-content-type-options\|referrer-policy"
```

Expected: all four headers present.

- [ ] **Step 6: Confirm layer-1/layer-2 route protection is untouched**

Run: `npx vitest run auth.spec.ts` and the existing `(dashboard)`-group
`page.spec.tsx` route-protection tests. Expected: all still PASS — this
task changed no auth-related file, so this step is a regression check,
not new coverage.

- [ ] **Step 7: Run the full web suite**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean, no regressions.

- [ ] **Step 8: Commit**

```bash
git add web/next.config.ts web/next.config.spec.ts
git commit -m "feat: report-only CSP + baseline security headers via next.config headers() (S04.14)"
```

---

### Task 11: Input bounds audit + finance-api global exception filter

**Files:**
- Create: `finance-api/src/common/all-exceptions.filter.ts`
- Create: `finance-api/src/common/all-exceptions.filter.spec.ts`
- Modify: `finance-api/src/main.ts`
- Modify: DTOs found to be missing bounds during the audit in Step 1
  (exact file list depends on audit findings — see Step 1)

**Interfaces:**
- Produces: `AllExceptionsFilter` (implements `ExceptionFilter`) — any
  error that isn't already a `HttpException` becomes a generic `500` with
  body `{ statusCode: 500, message: 'Internal server error' }`, logged
  server-side (stack trace to the server log only, never the response).

- [ ] **Step 1: Audit existing DTOs for missing bounds**

Run: `grep -rn "z\.string()\|z\.number()\|z\.array(" finance-api/src/*/dto/*.ts`

For each match, check whether a length/range/array-size bound already
exists (`.max()`, `.min()` beyond just presence, `.int()`, etc.). Compile
a list of DTOs missing a bound that matters (e.g. `category: z.string()`
with no `.max()` — an attacker could send a multi-megabyte category
string; `ImportPreviewDto`'s row-count context was already capped at 5000
per Sprint 6/Epic 11, confirmed — don't re-add what's already there).
This step's output is a short list — write it into the commit message in
Step 6, don't invent bounds for fields that already have them.

At minimum, add (verify each still exists as described before adding —
the codebase may have already closed some of these since this plan was
written):

- `finance-api/src/transactions/dto/create-transaction.dto.ts`:
  `category?: string` gains `.max(200)` if it doesn't already have a
  bound.
- `finance-api/src/accounts/dto/create-account.dto.ts`: `name: string`
  gains `.max(200)` if unbounded.
- `finance-api/src/accounts/dto/update-account.dto.ts`: same for `name`.

- [ ] **Step 2: Write a failing test per DTO found missing a bound**

For each DTO identified in Step 1, add a test following this shape
(shown for `create-transaction.dto.ts`; repeat per file):

```typescript
// finance-api/src/transactions/dto/create-transaction.dto.spec.ts — add
  it('rejects a category longer than 200 characters', () => {
    const result = CreateTransactionDto.schema.safeParse({
      accountId: 1,
      type: 'expense',
      amount: -10,
      occurredOn: '2026-01-15',
      category: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 3: Run to verify failures**

Run: `npx vitest run src/transactions/dto/create-transaction.dto.spec.ts src/accounts/dto/create-account.dto.spec.ts src/accounts/dto/update-account.dto.spec.ts`
Expected: FAIL for each newly-added case (adjust the exact file list to
match Step 1's actual findings).

- [ ] **Step 4: Add the bounds, run again to verify pass**

Add `.max(200)` (or the appropriate bound per field) to each identified
schema field. Re-run the same command as Step 3.
Expected: PASS.

- [ ] **Step 5: Write the failing test for the global exception filter**

```typescript
// finance-api/src/common/all-exceptions.filter.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost(getResponse: () => unknown) {
  return {
    switchToHttp: () => ({
      getResponse: () => getResponse(),
      getRequest: () => ({ url: '/test' }),
    }),
  } as never;
}

describe('AllExceptionsFilter', () => {
  it('passes through an existing HttpException with its own status and message', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), mockHost(() => ({ status })));
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not found' }));
  });

  it('converts an unhandled Error into a generic 500 with no stack trace in the body', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    filter.catch(new Error('some internal detail, e.g. a SQL fragment'), mockHost(() => ({ status })));
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('some internal detail');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/common/all-exceptions.filter.spec.ts`
Expected: FAIL — the filter doesn't exist yet.

- [ ] **Step 7: Implement the filter**

```typescript
// finance-api/src/common/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

// Last line of defense (improvements.md S04.15): every intentional
// error path already throws a typed HttpException with its own message
// (ValidationPipe/ZodValidationPipe's 400s, NotFoundException,
// ForbiddenException, UnauthorizedException, etc.) — this filter only
// catches what nothing else caught, and converts it into a response that
// never leaks a stack trace, SQL fragment, or internal detail.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
```


- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/common/all-exceptions.filter.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 9: Wire into `main.ts`**

```typescript
// finance-api/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { validateEnv } from './common/validate-env.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

async function bootstrap() {
  validateEnv(process.env, ['DATABASE_URL', 'INTERNAL_API_SECRET']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' });

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
  const allowedOrigins = new Set([webOrigin, 'http://localhost:3001']);
  app.enableCors({ origin: [...allowedOrigins] });

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

- [ ] **Step 10: Write an e2e test proving a real unhandled error is caught (closes the exact gap noted since Sprint 7 S1 — a calendar-invalid date used to 500 raw)**

```typescript
// finance-api/test/global-exception-filter.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter.js';

async function signInternalToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('saldovio-web')
    .setAudience('saldovio-finance-api')
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(secret);
}

describe('global exception filter (S04.15)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a request for a nonexistent account (triggers findUniqueOrThrow) returns a clean 4xx/5xx with no stack trace in the body', async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: { email: `filter-test-${suffix}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    const token = await signInternalToken(String(user.id));

    const res = await request(app.getHttpServer())
      .patch('/accounts/999999999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should not matter' });

    await prisma.user.delete({ where: { id: user.id } });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-shaped text
  });
});
```

- [ ] **Step 11: Run to verify it passes**

Run: `npx vitest run --config ./vitest.config.e2e.ts test/global-exception-filter.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 12: Run the full unit and e2e suites**

Run: `npm test && npm run test:e2e`
Expected: PASS, no regressions.

- [ ] **Step 13: Commit**

```bash
git add finance-api/src/common/all-exceptions.filter.ts finance-api/src/common/all-exceptions.filter.spec.ts finance-api/src/main.ts finance-api/test/global-exception-filter.e2e-spec.ts <any DTO files changed in Step 4> <their .spec.ts files>
git commit -m "feat: global exception filter + DTO length bounds audit (S04.15)"
```

---

### Task 12: No cross-user response caching

**Files:**
- Modify: `finance-api/src/main.ts`
- Modify: `web/next.config.ts` (extends Task 10's `headers()` rule)
- Test: `finance-api/test/no-cache.e2e-spec.ts` (new)

**Interfaces:**
- Produces: every `finance-api` response carries `Cache-Control: private,
  no-store` (via a global Nest interceptor, applied after routing so it
  covers every controller including future ones without per-route
  repetition).

- [ ] **Step 1: Write the failing test**

```typescript
// finance-api/test/no-cache.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NoCacheInterceptor } from '../src/common/no-cache.interceptor.js';

async function signInternalToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('saldovio-web')
    .setAudience('saldovio-finance-api')
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(secret);
}

describe('no cross-user response caching (S04.16)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalInterceptors(new NoCacheInterceptor());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /accounts/me responds with Cache-Control: private, no-store', async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: { email: `no-cache-${suffix}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    const token = await signInternalToken(String(user.id));

    const res = await request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', `Bearer ${token}`);

    await prisma.user.delete({ where: { id: user.id } });

    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `finance-api/`): `npx vitest run --config ./vitest.config.e2e.ts test/no-cache.e2e-spec.ts`
Expected: FAIL — `no-cache.interceptor.js` doesn't exist yet.

- [ ] **Step 3: Implement the interceptor**

```typescript
// finance-api/src/common/no-cache.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

// improvements.md S04.16: every response here is per-user financial
// data — a shared/misconfigured proxy or a browser's own disk cache
// must never serve one user's response to a later request on the same
// device (e.g. after logout, back-navigation on a shared computer).
@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    return next.handle();
  }
}
```

- [ ] **Step 4: Wire into `main.ts`**

```typescript
// finance-api/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { validateEnv } from './common/validate-env.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { NoCacheInterceptor } from './common/no-cache.interceptor.js';

async function bootstrap() {
  validateEnv(process.env, ['DATABASE_URL', 'INTERNAL_API_SECRET']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' });

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
  const allowedOrigins = new Set([webOrigin, 'http://localhost:3001']);
  app.enableCors({ origin: [...allowedOrigins] });

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new NoCacheInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --config ./vitest.config.e2e.ts test/no-cache.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify `web`'s Server Components already avoid caching (should already be true — this step confirms, doesn't newly implement)**

Run: `grep -rn "cache:" web/lib/*.ts`
Expected: every `fetch` call to `finance-api`/`analytics-service` already
passes `cache: "no-store"` (confirmed present in `web/lib/transactions.ts`,
`web/lib/accounts.ts`, `web/lib/analytics.ts` since their respective
introducing stories). If any fetch call to a per-user endpoint is missing
this, add it as part of this task and note which file in the commit
message.

- [ ] **Step 7: Add explicit no-store headers on every page response (defense against a shared-device back-navigation after logout, per S04.16's acceptance test)**

`(dashboard)/layout.tsx` is a Server Component — Next.js Server
Components don't expose a direct way to set response headers from within
the component itself. Add the header the same way Task 10 added CSP/
security headers — via `next.config.ts`'s `headers()` (already present
after Task 10; extend its existing `/:path*` rule rather than adding a
second one):

```typescript
// web/next.config.ts — inside the existing headers() from Task 10, add
// one more entry to the same "/:path*" rule's headers array:
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "private, no-store" },
```

(Applied globally rather than scoped to just the dashboard routes —
`/login`/`/signup` carrying `no-store` too is harmless for this app and
keeps one `headers()` rule instead of two overlapping ones.)

- [ ] **Step 8: Manually verify shared-device back-navigation**

In a browser: log in, view the dashboard, log out, then press the
browser's Back button. Expected: either redirected to `/login` (layer-2
auth check re-runs) or, if the page renders from `bfcache`, the browser
still doesn't display cached financial data indefinitely — confirm the
`Cache-Control` header is present via DevTools' Network tab on the
original authenticated request.

- [ ] **Step 9: Run the full test suites**

Run (from `finance-api/`): `npm test && npm run test:e2e`
Run (from `web/`): `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean, no regressions.

- [ ] **Step 10: Commit**

```bash
git add finance-api/src/common/no-cache.interceptor.ts finance-api/src/main.ts finance-api/test/no-cache.e2e-spec.ts web/next.config.ts
git commit -m "feat: no-store cache-control on financial API responses and dashboard routes (S04.16)"
```

---

## Final Story Verification

After all 12 tasks are individually committed on the story's branch/
worktree:

- [ ] Run every service's full suite one more time from a clean checkout
  state: `finance-api`: `npm test && npm run test:e2e`; `web`: `npx tsc
  --noEmit && npx eslint . && npm test && npm run build`;
  `analytics-service`: `pytest`.
- [ ] Confirm the two originally-red tests now pass:
  `npx vitest run finance-api/src/auth/internal-auth.guard.spec.ts` (4/4)
  and `npx vitest run --config finance-api/vitest.config.e2e.ts
  finance-api/test/improvements-findings.e2e-spec.ts -t F11c` (pass).
- [ ] Confirm `F11d` and `F18` in `improvements-findings.e2e-spec.ts` are
  still red and untouched (out of scope, per Global Constraints) —
  running the full `improvements-findings.e2e-spec.ts` file should show
  exactly those two still failing, nothing else.
- [ ] Per this project's standing pattern: dispatch a final whole-branch
  review (most capable model available) before merge, looking
  specifically for cross-task issues no single task's reviewer could
  see (e.g. do Task 3's rate limits and Task 5's ownership test suite
  collide under CI's shared test-run state; does Task 10's `proxy.ts`
  rewrite interact correctly with Task 9's cookie verification and
  Task 12's added header).
- [ ] Update `improvements.md`, ticking S04.1, S04.2, S04.4, S04.5,
  S04.8, S04.9, S04.10, S04.11, S04.12, S04.13, S04.14, S04.15, S04.16 to
  `[x]` — leave S04.3, S04.6, S04.7 unchecked (Story 2 / Epic 24).
- [ ] Update `docs/roadmap/2026-09-23-target-model.md`'s "Session
  version" row to say "Epic 15 Story 2" instead of "Epic 15 Story 3" (the
  renumbering decided in this story's spec) — a one-line documentation
  fix, not a scope change.
- [ ] Merge via a real PR (not a direct push) so Epic 12 S2's CI gate
  actually runs against this branch — the last direct push to `main`
  bypassed all 3 required status checks (noted after pushing Epic 14's
  merge); this story should be the one that goes through CI for real.

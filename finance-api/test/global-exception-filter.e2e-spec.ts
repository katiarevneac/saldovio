// Proves the exact gap noted since Sprint 7 S1 (and re-flagged during
// Epic 11 Story 1's own task review) is now closed: a well-signed
// internal token for a user id that no longer exists in the DB passes
// InternalAuthGuard cleanly (it only verifies the JWT itself, never
// looks the user up — see internal-auth.guard.ts) and used to reach
// UsersService.getSettings()'s prisma.user.findUniqueOrThrow(), which
// throws an unhandled Prisma.PrismaClientKnownRequestError (P2025) with
// no HttpException wrapper anywhere on the path — before this filter
// existed, that error's stack trace/internal detail would have leaked
// straight into the HTTP response body.
//
// Note: the brief's own reference test targeted `PATCH /accounts/:id`
// on a nonexistent account id, on the assumption that would trigger a
// findUniqueOrThrow. That's no longer accurate — AccountsService.update()
// uses `findFirst` + an explicit `ForbiddenException` ownership check
// (a typed HttpException, already handled cleanly), not
// findUniqueOrThrow at all. UsersService.getSettings() is the real,
// currently-existing findUniqueOrThrow call site reachable this way.
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

  it('a request for a since-deleted user (triggers findUniqueOrThrow) returns a clean 4xx/5xx with no stack trace in the body', async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: { email: `filter-test-${suffix}@example.com`, passwordHash: 'not-a-real-hash' },
    });
    const token = await signInternalToken(String(user.id));

    // Delete the user (and, in FK-safe order, its default account) after
    // signing a valid token for it — InternalAuthGuard never checks the
    // user still exists, so this token remains "valid" purely as far as
    // the guard is concerned, and the request reaches getSettings().
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });

    const res = await request(app.getHttpServer())
      .get('/users/me/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-shaped text
    expect(raw).not.toContain('PrismaClientKnownRequestError');
    expect(raw).not.toContain('findUniqueOrThrow');
  });
});

// Reproduction tests for improvements.md's P0 findings that need real HTTP
// behavior (rate limiting, idempotency, import-commit trust boundary),
// rather than a unit-level check. Each test asserts the CORRECT behavior
// and is expected to fail today — see the comment above each `it` for the
// specific finding it proves.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function signInternalToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(secret);
}

describe('improvements.md P0 findings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's bootstrap exactly — AppModule alone doesn't apply
    // the global validation pipe.
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // improvements.md F11c (P0): no rate limiting exists anywhere in
  // finance-api (zero hits for throttle/rate-limit in the whole service).
  // POST /auth/login runs a full bcrypt.compare per attempt with no
  // backoff, allowing unlimited credential stuffing against a real
  // account.
  //
  // EXPECTED (once F11c is fixed): repeated rapid wrong-password attempts
  // against the same account eventually return 429.
  // CURRENT (proves the finding): every attempt returns 401, none 429.
  it(
    'F11c: rapid repeated wrong-password login attempts are never rate-limited',
    async () => {
      const email = `f11c-ratelimit-${Date.now()}@example.com`;
      await prisma.user.create({
        data: { email, passwordHash: await bcrypt.hash('correct-password-123', 10) },
      });

      const statuses: number[] = [];
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'wrong-password' });
        statuses.push(res.status);
      }

      await prisma.user.delete({ where: { email } });

      expect(statuses).toContain(429);
    },
    30_000,
  );

  // improvements.md F11d (P0): no manual write endpoint accepts or checks
  // an idempotency key (grep for "idempoten" across the whole service
  // returns nothing functional). CreateTransactionSchema has no such
  // field, and transactions.service.ts's create() is a bare
  // prisma.transaction.create with no dedupe check — a retried or
  // double-submitted identical request creates two rows.
  //
  // EXPECTED (once F11d is fixed): sending the identical request twice
  // with the same idempotency key results in exactly one stored row.
  // CURRENT (proves the finding): two rows are created.
  it('F11d: an identical POST /transactions sent twice creates two rows instead of one', async () => {
    const email = `f11d-idempotency-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-a-real-hash' },
    });
    const account = await prisma.account.create({
      data: { name: 'Idempotency test', currentBalance: '0', referenceDate: new Date('2026-01-01'), openingBoundary: 'start_of_day', userId: user.id },
    });
    const token = await signInternalToken(String(user.id));

    const body = {
      accountId: account.id,
      type: 'expense',
      amount: -42.5,
      occurredOn: '2026-01-15',
      category: 'Test',
    };

    // Real clients send an idempotency key on a retry; the endpoint has
    // nowhere to put one, so this header is simply ignored today.
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'f11d-same-key')
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'f11d-same-key')
      .send(body)
      .expect(201);

    const count = await prisma.transaction.count({ where: { accountId: account.id } });

    await prisma.transaction.deleteMany({ where: { accountId: account.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });

    expect(count).toBe(1);
  });

  // improvements.md F18 (P0): /transactions/import/commit trusts every
  // client-supplied field (hash, occurredOn, type, amount, category) with
  // no server-side staging/batch table and no re-derivation of the hash
  // (import-commit.dto.ts's ImportRowSchema — hash is only `min(1)`, never
  // recomputed or looked up). A caller can post an invented row — with no
  // prior call to /import/preview at all — and it is inserted verbatim
  // after only an account-ownership check.
  //
  // EXPECTED (once F18 is fixed): a commit with no corresponding staged
  // preview is rejected.
  // CURRENT (proves the finding): accepted and inserted (201).
  it('F18: import/commit accepts an invented row with no prior preview call', async () => {
    const email = `f18-commit-trust-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-a-real-hash' },
    });
    const account = await prisma.account.create({
      data: { name: 'Commit trust test', currentBalance: '0', referenceDate: new Date('2026-01-01'), openingBoundary: 'start_of_day', userId: user.id },
    });
    const token = await signInternalToken(String(user.id));

    const res = await request(app.getHttpServer())
      .post('/transactions/import/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: account.id,
        rows: [
          {
            hash: 'invented-hash-never-seen-by-preview'.padEnd(64, '0'),
            occurredOn: '2026-01-20',
            type: 'income',
            amount: 999999.99,
            category: 'Invented',
          },
        ],
      });

    const count = await prisma.transaction.count({ where: { accountId: account.id } });

    await prisma.transaction.deleteMany({ where: { accountId: account.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(count).toBe(0);
  });

  // improvements.md F16 (P0), charset sub-claim: the review's inspection
  // pass read the source (`@Header('Content-Type', 'text/csv')`, no
  // explicit charset) and flagged this as missing. Written as a repro
  // test, it turned out FALSE — Express's res.set/type appends ";
  // charset=utf-8" automatically for known text/* mime types, so the
  // actual wire response already declares it. Source inspection alone
  // (as most of the P1 findings in this codebase were verified) can miss
  // a framework default like this; kept here as a passing regression
  // guard and as the documented correction to F16's charset half. The
  // BOM half of F16 (see transactions.service.spec.ts) is still TRUE.
  it('F16 (corrected): GET /transactions/export already declares charset=utf-8 via Express default', async () => {
    const email = `f16-export-charset-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-a-real-hash' },
    });
    const token = await signInternalToken(String(user.id));

    const res = await request(app.getHttpServer())
      .get('/transactions/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await prisma.user.delete({ where: { id: user.id } });

    expect(res.headers['content-type']).toContain('charset=utf-8');
  });
});

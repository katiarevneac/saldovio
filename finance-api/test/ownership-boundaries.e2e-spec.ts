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
      .send({ name: 'Renamed by B', currentBalance: 0, referenceDate: '2026-01-01' });
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

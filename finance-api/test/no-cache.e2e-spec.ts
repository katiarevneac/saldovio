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

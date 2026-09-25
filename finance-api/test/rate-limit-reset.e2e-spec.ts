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

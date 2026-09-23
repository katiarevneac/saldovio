import { describe, expect, it, afterAll } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects through the pg adapter and can write, read, and delete a row', async () => {
    const email = `prisma-service-spec-${Date.now()}@example.com`;
    const created = await prisma.user.create({
      data: { email, passwordHash: 'test-hash' },
    });

    const found = await prisma.user.findUnique({ where: { id: created.id } });
    expect(found?.email).toBe(email);

    await prisma.user.delete({ where: { id: created.id } });
  });
});

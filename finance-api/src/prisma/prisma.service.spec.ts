import { describe, expect, it, afterAll } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const prisma = new PrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to saldovio_dev through the pg adapter and can read existing rows', async () => {
    const userCount = await prisma.user.count();
    expect(userCount).toBeGreaterThan(0);
  });
});

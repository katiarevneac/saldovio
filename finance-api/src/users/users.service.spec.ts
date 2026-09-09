import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  const testEmail = `prisma-migration-test-${Date.now()}@example.com`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, PrismaService],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { account: { user: { email: testEmail } } } });
    await prisma.recurringRule.deleteMany({ where: { account: { user: { email: testEmail } } } });
    await prisma.account.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user and a default "Cont curent" account atomically', async () => {
    const user = await service.create({ email: testEmail, password: 'password123' });

    expect(user.email).toBe(testEmail);
    expect(typeof user.id).toBe('number');

    const accounts = await prisma.account.findMany({ where: { userId: user.id } });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('Cont curent');
    expect(accounts[0].currentBalance.toString()).toBe('0');
  });

  it('rejects a duplicate email with ConflictException', async () => {
    await service.create({ email: testEmail, password: 'password123' });

    await expect(
      service.create({ email: testEmail, password: 'password456' }),
    ).rejects.toThrow('Email already registered');
  });
});

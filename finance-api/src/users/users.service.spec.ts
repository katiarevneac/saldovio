import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayDateOnly } from '../common/serialization.js';
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

  it('rolls back the user row if a later write in the same transaction fails', async () => {
    const rollbackEmail = `${testEmail}-rollback`;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { email: rollbackEmail, passwordHash: 'x' } });
        // Force a real Postgres FK violation on the second write, inside
        // the same transaction, to prove $transaction actually rolls back
        // the first write — not just that it's structurally wrapped in one.
        await tx.account.create({
          data: {
            name: 'Should not persist',
            currentBalance: new Prisma.Decimal(0),
            referenceDate: todayDateOnly(),
            userId: -1, // no user with this id exists — FK violation
          },
        });
      }),
    ).rejects.toThrow();

    const rolledBackUser = await prisma.user.findUnique({ where: { email: rollbackEmail } });
    expect(rolledBackUser).toBeNull();
  });
});

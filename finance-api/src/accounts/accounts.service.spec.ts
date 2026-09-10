import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountsService } from './accounts.service.js';
import { fromDateOnlyString } from '../common/serialization.js';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: PrismaService;
  let userId: number;
  const testEmail = `accounts-prisma-test-${Date.now()}@example.com`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsService, PrismaService],
    }).compile();

    service = module.get(AccountsService);
    prisma = module.get(PrismaService);

    const user = await prisma.user.create({
      data: { email: testEmail, passwordHash: 'not-a-real-hash' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { account: { userId } } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an account and returns money/date fields as strings', async () => {
    const account = await service.create(
      { name: 'Test account', currentBalance: 100.5, referenceDate: '2026-01-01' },
      userId,
    );

    // toDecimalString's .toString() drops non-significant trailing zeros
    // (same documented, reviewed behavior as common/serialization.spec.ts —
    // '100.50' normalizes to '100.5', not a precision loss). Task 2's brief
    // made this exact same wrong assumption and was corrected the same way.
    expect(account.current_balance).toBe('100.5');
    expect(typeof account.current_balance).toBe('string');
    expect(account.reference_date).toBe('2026-01-01');
  });

  it('adds only transactions strictly after reference_date to the balance', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Balance test',
        currentBalance: new Prisma.Decimal('100.00'),
        referenceDate: fromDateOnlyString('2026-01-15'),
        userId,
      },
    });

    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: new Prisma.Decimal('-20.00'),
        occurredOn: fromDateOnlyString('2026-01-15'),
      },
    });
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'income',
        amount: new Prisma.Decimal('50.00'),
        occurredOn: fromDateOnlyString('2026-01-16'),
      },
    });

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;

    // Same trailing-zero normalization as above, applied to the $queryRaw
    // computed column — confirms toDecimalString behaves identically on a
    // Prisma.Decimal sourced from $queryRaw as on one from the query builder.
    expect(result.balance).toBe('150');
    expect(typeof result.balance).toBe('string');
  });
});

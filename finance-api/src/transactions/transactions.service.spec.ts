import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransactionsService } from './transactions.service.js';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: PrismaService;
  let userId: number;
  let accountId: number;
  let otherUserAccountId: number;
  const testEmail = `transactions-prisma-test-${Date.now()}@example.com`;
  const otherEmail = `transactions-prisma-other-${Date.now()}@example.com`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, PrismaService],
    }).compile();

    service = module.get(TransactionsService);
    prisma = module.get(PrismaService);

    const user = await prisma.user.create({ data: { email: testEmail, passwordHash: 'x' } });
    userId = user.id;
    const account = await prisma.account.create({
      data: { name: 'Test', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), userId },
    });
    accountId = account.id;

    const otherUser = await prisma.user.create({ data: { email: otherEmail, passwordHash: 'x' } });
    const otherAccount = await prisma.account.create({
      data: { name: 'Other', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), userId: otherUser.id },
    });
    otherUserAccountId = otherAccount.id;
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { account: { user: { email: { in: [testEmail, otherEmail] } } } } });
    await prisma.account.deleteMany({ where: { user: { email: { in: [testEmail, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [testEmail, otherEmail] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a transaction and returns amount/date as strings', async () => {
    const transaction = await service.create(
      { accountId, type: 'expense', amount: -75.2, occurredOn: '2026-09-10', category: 'Groceries' },
      userId,
    );

    expect(transaction.amount).toBe('-75.2');
    expect(typeof transaction.amount).toBe('string');
    expect(transaction.occurred_on).toBe('2026-09-10');
  });

  it('rejects writing to an account that does not belong to the caller', async () => {
    await expect(
      service.create(
        { accountId: otherUserAccountId, type: 'expense', amount: -10, occurredOn: '2026-09-10' },
        userId,
      ),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('findAll only returns the caller\'s own transactions', async () => {
    await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10' }, userId);

    const transactions = await service.findAll(userId);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].account_id).toBe(accountId);
  });
});

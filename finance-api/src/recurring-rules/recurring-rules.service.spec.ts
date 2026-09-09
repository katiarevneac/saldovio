import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurringRulesService } from './recurring-rules.service.js';

describe('RecurringRulesService', () => {
  let service: RecurringRulesService;
  let prisma: PrismaService;
  let userId: number;
  let accountId: number;
  let otherUserAccountId: number;
  const testEmail = `recurring-prisma-test-${Date.now()}@example.com`;
  const otherEmail = `recurring-prisma-other-${Date.now()}@example.com`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurringRulesService, PrismaService],
    }).compile();

    service = module.get(RecurringRulesService);
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
    await prisma.recurringRule.deleteMany({ where: { account: { user: { email: { in: [testEmail, otherEmail] } } } } });
    await prisma.account.deleteMany({ where: { user: { email: { in: [testEmail, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [testEmail, otherEmail] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a recurring rule and returns amount as a string', async () => {
    const rule = await service.create(
      { accountId, type: 'expense', amount: 250, dayOfMonth: 1, category: 'Rent' },
      userId,
    );

    expect(rule.amount).toBe('250');
    expect(typeof rule.amount).toBe('string');
    expect(rule.day_of_month).toBe(1);
    expect(rule.active).toBe(true);
  });

  it('rejects writing to an account that does not belong to the caller', async () => {
    await expect(
      service.create({ accountId: otherUserAccountId, type: 'expense', amount: 100, dayOfMonth: 1 }, userId),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('findAll only returns the caller\'s own active rules', async () => {
    await service.create({ accountId, type: 'income', amount: 3000, dayOfMonth: 15 }, userId);

    const rules = await service.findAll(userId);

    expect(rules).toHaveLength(1);
    expect(rules[0].account_id).toBe(accountId);
  });
});

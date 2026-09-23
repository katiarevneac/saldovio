import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
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
      providers: [TransactionsService, PrismaService, ClockService],
    }).compile();

    service = module.get(TransactionsService);
    prisma = module.get(PrismaService);

    const user = await prisma.user.create({ data: { email: testEmail, passwordHash: 'x' } });
    userId = user.id;
    const account = await prisma.account.create({
      data: { name: 'Test', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), openingBoundary: 'start_of_day', userId },
    });
    accountId = account.id;

    const otherUser = await prisma.user.create({ data: { email: otherEmail, passwordHash: 'x' } });
    const otherAccount = await prisma.account.create({
      data: { name: 'Other', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), openingBoundary: 'start_of_day', userId: otherUser.id },
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

  // S03.5: a transaction dated in the future can't have "actually
  // happened" — reject it as `actual` (the default), same as any other
  // financial-correctness rule, not a soft UX warning.
  it('rejects a future-dated actual transaction', async () => {
    const fixedTodayModule: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, PrismaService, ClockService],
    })
      .overrideProvider(ClockService)
      .useValue({ now: () => new Date('2026-06-15T00:00:00.000Z'), today: () => new Date(Date.UTC(2026, 5, 15)) })
      .compile();
    const fixedClockService = fixedTodayModule.get(TransactionsService);

    await expect(
      fixedClockService.create(
        { accountId, type: 'income', amount: 100, occurredOn: '2026-06-16' },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // S03.5: the explicit alternative — a future-dated entry is fine as
  // long as it's marked `planned`, not `actual`.
  it('accepts a future-dated planned transaction and returns lifecycle: planned', async () => {
    const fixedTodayModule: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, PrismaService, ClockService],
    })
      .overrideProvider(ClockService)
      .useValue({ now: () => new Date('2026-06-15T00:00:00.000Z'), today: () => new Date(Date.UTC(2026, 5, 15)) })
      .compile();
    const fixedClockService = fixedTodayModule.get(TransactionsService);

    const transaction = await fixedClockService.create(
      { accountId, type: 'income', amount: 100, occurredOn: '2026-06-16', lifecycle: 'planned' },
      userId,
    );

    expect(transaction.lifecycle).toBe('planned');
  });

  it('defaults a transaction to lifecycle: actual when omitted', async () => {
    const transaction = await service.create(
      { accountId, type: 'expense', amount: -10, occurredOn: '2026-09-10' },
      userId,
    );

    expect(transaction.lifecycle).toBe('actual');
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

  const REVOLUT_HEADER =
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

  function revolutCsv(...rows: string[]): Buffer {
    return Buffer.from([REVOLUT_HEADER, ...rows].join('\n'));
  }

  it('previewImport parses a valid CSV and reports it as valid with no duplicates', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    const result = await service.previewImport(accountId, csv, userId);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      status: 'valid',
      occurred_on: '2026-09-10',
      type: 'expense',
      amount: '-12.50',
      category: 'CARD_PAYMENT',
    });
  });

  it('previewImport flags a row as duplicate when its hash already exists for the account', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );
    const first = await service.previewImport(accountId, csv, userId);
    await service.commitImport(
      accountId,
      first.rows.map((r) => ({
        hash: r.hash,
        occurredOn: r.occurred_on!,
        type: r.type!,
        amount: Number(r.amount),
        category: r.category!,
      })),
      userId,
    );

    const second = await service.previewImport(accountId, csv, userId);

    expect(second.rows[0].status).toBe('duplicate');
  });

  it('previewImport does not flag a row as duplicate on the very first import', async () => {
    const csv = revolutCsv(
      'TOPUP,Current,2026-09-11 09:00:00,2026-09-11 09:00:00,Top-up,100.00,0,RON,COMPLETED,1087.50',
    );

    const result = await service.previewImport(accountId, csv, userId);

    expect(result.rows[0].status).toBe('valid');
  });

  it('previewImport rejects uploading against an account that does not belong to the caller', async () => {
    await expect(
      service.previewImport(otherUserAccountId, revolutCsv(), userId),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('previewImport surfaces an unparseable CSV as a BadRequestException', async () => {
    await expect(
      service.previewImport(accountId, Buffer.from('not,a,valid\nheader,has,fewer,columns,than,rows'), userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previewImport writes nothing to the database', async () => {
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    await service.previewImport(accountId, csv, userId);

    const stored = await prisma.transaction.findMany({ where: { accountId } });
    expect(stored).toHaveLength(0);
  });

  it('commitImport inserts the given rows and stamps each with its hash', async () => {
    const result = await service.commitImport(
      accountId,
      [{ hash: 'hash-a', occurredOn: '2026-09-10', type: 'expense', amount: -12.5, category: 'Coffee' }],
      userId,
    );

    expect(result).toEqual({ imported: 1, skipped_duplicates: 0 });
    const stored = await prisma.transaction.findMany({ where: { accountId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].importHash).toBe('hash-a');
    expect(stored[0].amount.toString()).toBe('-12.5');
  });

  it('commitImport skips a row whose hash already exists for the account, without failing the batch', async () => {
    await prisma.transaction.create({
      data: {
        accountId,
        type: 'expense',
        amount: new Prisma.Decimal(-5),
        occurredOn: new Date('2026-09-01T00:00:00.000Z'),
        category: 'Old',
        importHash: 'existing-hash',
      },
    });

    const result = await service.commitImport(
      accountId,
      [
        { hash: 'existing-hash', occurredOn: '2026-09-10', type: 'expense', amount: -5, category: 'Old' },
        { hash: 'new-hash', occurredOn: '2026-09-10', type: 'income', amount: 100, category: 'New' },
      ],
      userId,
    );

    expect(result).toEqual({ imported: 1, skipped_duplicates: 1 });
    const stored = await prisma.transaction.findMany({
      where: { accountId, importHash: { in: ['existing-hash', 'new-hash'] } },
    });
    expect(stored).toHaveLength(2);
  });

  it('commitImport inserts a hash only once even if it appears twice in the same request', async () => {
    const result = await service.commitImport(
      accountId,
      [
        { hash: 'repeat-hash', occurredOn: '2026-09-10', type: 'income', amount: 10, category: 'A' },
        { hash: 'repeat-hash', occurredOn: '2026-09-10', type: 'income', amount: 10, category: 'A' },
      ],
      userId,
    );

    expect(result).toEqual({ imported: 1, skipped_duplicates: 1 });
    const stored = await prisma.transaction.findMany({ where: { accountId, importHash: 'repeat-hash' } });
    expect(stored).toHaveLength(1);
  });

  it('commitImport rejects committing into an account that does not belong to the caller', async () => {
    await expect(
      service.commitImport(
        otherUserAccountId,
        [{ hash: 'x', occurredOn: '2026-09-10', type: 'income', amount: 1, category: 'X' }],
        userId,
      ),
    ).rejects.toThrow('Account does not belong to the current user');
  });

  it('a batch commit rolls back entirely if a later insert in the same transaction fails', async () => {
    // Proves Prisma's $transaction actually rolls back a batch of
    // individual transaction.create calls for this model — not just
    // that commitImport is structurally wrapped in one. Same pattern
    // as the atomic-signup rollback test in users.service.spec.ts.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            accountId,
            type: 'income',
            amount: new Prisma.Decimal(10),
            occurredOn: new Date('2026-09-10T00:00:00.000Z'),
            category: 'Test',
            importHash: 'rollback-hash-1',
          },
        });
        // Force a real Postgres FK violation on the second write.
        await tx.transaction.create({
          data: {
            accountId: -1,
            type: 'income',
            amount: new Prisma.Decimal(20),
            occurredOn: new Date('2026-09-10T00:00:00.000Z'),
            category: 'Test',
            importHash: 'rollback-hash-2',
          },
        });
      }),
    ).rejects.toThrow();

    const rolledBack = await prisma.transaction.findFirst({ where: { importHash: 'rollback-hash-1' } });
    expect(rolledBack).toBeNull();
  });

  it('commitImport rolls back the whole batch if a later row fails inside the transaction', async () => {
    await expect(
      service.commitImport(
        accountId,
        [
          { hash: 'good-hash', occurredOn: '2026-09-10', type: 'income', amount: 10, category: 'Test' },
          { hash: 'bad-hash', occurredOn: '2026-02-30', type: 'income', amount: 20, category: 'Test' },
        ],
        userId,
      ),
    ).rejects.toThrow();

    const rolledBack = await prisma.transaction.findFirst({ where: { importHash: 'good-hash' } });
    expect(rolledBack).toBeNull();
  });

  it('exportCsv returns a header row plus one line per transaction across all the caller\'s accounts', async () => {
    await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10', category: 'Salary' }, userId);
    await service.create({ accountId, type: 'expense', amount: -12.5, occurredOn: '2026-09-11', category: 'Coffee' }, userId);

    const csv = await service.exportCsv(userId);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('date,account,type,amount,category');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-09-10,Test,income,100,Salary');
    expect(lines[2]).toBe('2026-09-11,Test,expense,-12.5,Coffee');
  });

  it('exportCsv only includes the caller\'s own transactions', async () => {
    await service.create({ accountId, type: 'income', amount: 50, occurredOn: '2026-09-10', category: 'Mine' }, userId);
    await prisma.transaction.create({
      data: {
        accountId: otherUserAccountId,
        type: 'expense',
        amount: new Prisma.Decimal(-999),
        occurredOn: new Date('2026-09-10T00:00:00.000Z'),
        category: 'NotMine',
      },
    });

    const csv = await service.exportCsv(userId);

    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('Mine');
    expect(csv).not.toContain('NotMine');
    expect(csv).not.toContain('-999');
  });

  it('exportCsv returns just the header when the caller has no transactions', async () => {
    const csv = await service.exportCsv(userId);
    expect(csv).toBe('date,account,type,amount,category');
  });

  it('exportCsv escapes a category containing a comma', async () => {
    await service.create({ accountId, type: 'expense', amount: -1, occurredOn: '2026-09-10', category: 'Rent, September' }, userId);

    const csv = await service.exportCsv(userId);

    expect(csv.split('\n')[1]).toBe('2026-09-10,Test,expense,-1,"Rent, September"');
  });

  it('exportCsv includes transactions from every account the caller owns, not just one', async () => {
    const secondAccount = await prisma.account.create({
      data: {
        name: 'Savings',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: new Date(),
        openingBoundary: 'start_of_day',
        userId,
      },
    });
    await service.create({ accountId, type: 'income', amount: 10, occurredOn: '2026-09-10', category: 'FirstAccount' }, userId);
    await service.create({ accountId: secondAccount.id, type: 'income', amount: 20, occurredOn: '2026-09-11', category: 'SecondAccount' }, userId);

    const csv = await service.exportCsv(userId);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(3);
    expect(csv).toContain('FirstAccount');
    expect(csv).toContain('SecondAccount');
  });

  // improvements.md F16 (P0): exportCsv returns a plain string with no
  // UTF-8 BOM prefix, and the controller sets a bare "text/csv" Content-
  // Type with no charset (transactions.controller.ts's exportCsv route).
  // Without a BOM, Excel in particular can misinterpret non-ASCII text
  // (RON category names, merchant descriptions) using the system's
  // default codepage instead of UTF-8 when the file is opened directly.
  //
  // EXPECTED (once F16 is fixed): the returned CSV starts with the UTF-8
  // BOM (U+FEFF).
  // CURRENT (proves the finding): no BOM is present.
  it('F16: exportCsv omits the UTF-8 BOM needed for reliable spreadsheet import', async () => {
    const csv = await service.exportCsv(userId);
    expect(csv.startsWith('﻿')).toBe(true);
  });
});

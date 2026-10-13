import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClockService } from '../common/clock.service.js';
import { fromDateOnlyString, toDateOnlyString } from '../common/serialization.js';
import { AccountsService } from '../accounts/accounts.service.js';
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
      providers: [TransactionsService, AccountsService, PrismaService, ClockService],
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
      providers: [TransactionsService, AccountsService, PrismaService, ClockService],
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
      providers: [TransactionsService, AccountsService, PrismaService, ClockService],
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

  describe('findAll voided handling and serialization', () => {
    async function seedVoided(forAccountId: number) {
      return prisma.transaction.create({
        data: {
          accountId: forAccountId,
          type: 'expense',
          amount: new Prisma.Decimal(-5),
          occurredOn: fromDateOnlyString('2026-09-10'),
          lifecycle: 'voided',
        },
      });
    }

    it('hides voided transactions by default', async () => {
      await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10' }, userId);
      const voided = await seedVoided(accountId);

      const transactions = await service.findAll(userId);

      expect(transactions).toHaveLength(1);
      expect(transactions.map((t) => t.id)).not.toContain(voided.id);
    });

    it('includes voided transactions when includeVoided is true', async () => {
      const voided = await seedVoided(accountId);

      const transactions = await service.findAll(userId, true);

      expect(transactions.map((t) => t.id)).toContain(voided.id);
    });

    it("never shows another user's voided transaction, even with includeVoided", async () => {
      const otherVoided = await seedVoided(otherUserAccountId);

      const transactions = await service.findAll(userId, true);

      expect(transactions.map((t) => t.id)).not.toContain(otherVoided.id);
    });

    it('includes version, description and transfer_id in findAll and create responses', async () => {
      const created = await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10' }, userId);
      const [listed] = await service.findAll(userId);

      for (const t of [created, listed]) {
        expect(t.version).toBe(0);
        expect(t.description).toBeNull();
        expect(t.transfer_id).toBeNull();
      }
    });
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

  // Epic 14 Story 4: a preview row dated on/before the account's opening
  // snapshot won't move current_balance if imported (ADR 0002) — flag it
  // so the user sees that before committing, same as the manual-entry form.
  it('previewImport flags a row dated before the account reference_date as backdated', async () => {
    const boundaryAccount = await prisma.account.create({
      data: {
        name: 'Backdated import test',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-09-15'),
        openingBoundary: 'start_of_day',
        userId,
      },
    });
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    const result = await service.previewImport(boundaryAccount.id, csv, userId);

    expect(result.rows[0].backdated).toBe(true);
  });

  it('previewImport does not flag a row dated on/after the account reference_date as backdated', async () => {
    const boundaryAccount = await prisma.account.create({
      data: {
        name: 'Not-backdated import test',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-09-01'),
        openingBoundary: 'start_of_day',
        userId,
      },
    });
    const csv = revolutCsv(
      'CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50',
    );

    const result = await service.previewImport(boundaryAccount.id, csv, userId);

    expect(result.rows[0].backdated).toBe(false);
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

  it('exportCsv excludes voided transactions but keeps the rest', async () => {
    const a = await service.create({ accountId, type: 'income', amount: 100, occurredOn: '2026-09-10', category: 'Keep' }, userId);
    const b = await service.create({ accountId, type: 'expense', amount: -5, occurredOn: '2026-09-11', category: 'Gone' }, userId);
    await service.void(b.id, { version: b.version }, userId);
    const csv = await service.exportCsv(userId);
    expect(csv).toContain('Keep');
    expect(csv).not.toContain('Gone');
    expect(a.id).toBeDefined();
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

  describe('Epic 16 Story 1 — schema additions', () => {
    it('defaults version to 0 and description/transferId to null on a plain insert', async () => {
      const transaction = await prisma.transaction.create({
        data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
      });

      expect(transaction.version).toBe(0);
      expect(transaction.description).toBeNull();
      expect(transaction.transferId).toBeNull();
    });

    it('accepts a well-formed UUID in transferId', async () => {
      const transferId = '11111111-1111-1111-1111-111111111111';
      const transaction = await prisma.transaction.create({
        data: {
          accountId,
          type: 'transfer',
          amount: new Prisma.Decimal(-500),
          occurredOn: fromDateOnlyString('2026-10-01'),
          transferId,
        },
      });

      expect(transaction.transferId).toBe(transferId);
    });

    it('rejects a non-UUID string in transferId at the database type level', async () => {
      await expect(
        prisma.$executeRaw`INSERT INTO transactions (account_id, type, amount, occurred_on, transfer_id)
          VALUES (${accountId}, 'transfer', -500, ${fromDateOnlyString('2026-10-01')}, 'not-a-uuid')`,
      ).rejects.toThrow();
    });

    it('accepts lifecycle "voided" at the database CHECK constraint', async () => {
      const transaction = await prisma.transaction.create({
        data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
      });

      const voided = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { lifecycle: 'voided' },
      });

      expect(voided.lifecycle).toBe('voided');
    });

    it('still rejects a lifecycle value outside actual/planned/voided at the database CHECK constraint', async () => {
      const transaction = await prisma.transaction.create({
        data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
      });

      await expect(
        prisma.transaction.update({ where: { id: transaction.id }, data: { lifecycle: 'archived' } }),
      ).rejects.toThrow();
    });

    it('can update version independently, for a future optimistic-concurrency check to compare against', async () => {
      const transaction = await prisma.transaction.create({
        data: { accountId, type: 'expense', amount: new Prisma.Decimal(-10), occurredOn: fromDateOnlyString('2026-10-01') },
      });

      const bumped = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { version: { increment: 1 } },
      });

      expect(bumped.version).toBe(1);
    });
  });

  describe('Epic 16 Story 2 — void / restore', () => {
    const makeTx = (overrides: Partial<Prisma.TransactionUncheckedCreateInput> = {}) =>
      prisma.transaction.create({
        data: {
          accountId,
          type: 'expense',
          amount: new Prisma.Decimal(-10),
          occurredOn: fromDateOnlyString('2020-01-01'),
          ...overrides,
        },
      });

    const makePair = async () => {
      const second = await prisma.account.create({
        data: { name: 'Second', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), openingBoundary: 'start_of_day', userId },
      });
      const transferId = '22222222-2222-2222-2222-222222222222';
      const out = await makeTx({ type: 'transfer', amount: new Prisma.Decimal(-50), transferId });
      const into = await makeTx({ accountId: second.id, type: 'transfer', amount: new Prisma.Decimal(50), transferId });
      return { out, into };
    };

    it('voids an actual transaction and increments version', async () => {
      const t = await makeTx();
      const result = await service.void(t.id, { version: 0 }, userId);
      expect(result.lifecycle).toBe('voided');
      expect(result.version).toBe(1);
      expect(result.id).toBe(t.id);
    });

    it('rejects voiding a planned transaction with 400 (void is actual -> voided only)', async () => {
      const t = await makeTx({ lifecycle: 'planned' });
      await expect(service.void(t.id, { version: 0 }, userId)).rejects.toThrow(BadRequestException);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.lifecycle).toBe('planned');
    });

    it('rejects a stale version with 409 before any state validation (void/restore/edit)', async () => {
      const t = await makeTx();
      await service.void(t.id, { version: 0 }, userId); // now voided, version 1
      // Stale caller still believes version 0: 409, not the 400 the state would give.
      await expect(service.void(t.id, { version: 0 }, userId)).rejects.toThrow(ConflictException);
      await expect(service.restore(t.id, { version: 0 }, userId)).rejects.toThrow(ConflictException);
      await expect(service.update(t.id, { version: 0, category: 'X' }, userId)).rejects.toThrow(ConflictException);
    });

    it('rejects voiding an already voided transaction with 400', async () => {
      const t = await makeTx({ lifecycle: 'voided' });
      await expect(service.void(t.id, { version: 0 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects a stale version with 409 and leaves the row unchanged', async () => {
      const t = await makeTx();
      await expect(service.void(t.id, { version: 5 }, userId)).rejects.toThrow(ConflictException);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.lifecycle).toBe('actual');
      expect(after.version).toBe(0);
    });

    it('returns 404 for another user\'s transaction and for a missing id, identically', async () => {
      const foreign = await prisma.transaction.create({
        data: { accountId: otherUserAccountId, type: 'expense', amount: new Prisma.Decimal(-1), occurredOn: fromDateOnlyString('2020-01-01') },
      });
      await expect(service.void(foreign.id, { version: 0 }, userId)).rejects.toThrow(NotFoundException);
      await expect(service.void(foreign.id, { version: 0 }, userId)).rejects.toThrow('Transaction not found');
      await expect(service.void(999999999, { version: 0 }, userId)).rejects.toThrow('Transaction not found');
      await expect(service.restore(foreign.id, { version: 0 }, userId)).rejects.toThrow(NotFoundException);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: foreign.id } });
      expect(after.lifecycle).toBe('actual');
    });

    it('restores a voided transaction to actual and increments version', async () => {
      const t = await makeTx({ lifecycle: 'voided', version: 3 });
      const result = await service.restore(t.id, { version: 3 }, userId);
      expect(result.lifecycle).toBe('actual');
      expect(result.version).toBe(4);
    });

    it('rejects restoring a planned (non-voided) transaction with 400', async () => {
      const t = await makeTx({ lifecycle: 'planned' });
      await expect(service.restore(t.id, { version: 0 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects restoring a voided transaction dated in the future with 400', async () => {
      const t = await makeTx({ lifecycle: 'voided', occurredOn: fromDateOnlyString('2999-01-01') });
      await expect(service.restore(t.id, { version: 0 }, userId)).rejects.toThrow(BadRequestException);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.lifecycle).toBe('voided');
    });

    it('voids both legs of a transfer pair and bumps both versions', async () => {
      const { out, into } = await makePair();
      const result = await service.void(out.id, { version: 0 }, userId);
      expect(result.id).toBe(out.id);
      expect(result.transfer_id).toBe(out.transferId);
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } } });
      expect(legs.map((l) => l.lifecycle)).toEqual(['voided', 'voided']);
      expect(legs.map((l) => l.version)).toEqual([1, 1]);
    });

    it('restores both legs of a voided transfer pair', async () => {
      const { out, into } = await makePair();
      await service.void(into.id, { version: 0 }, userId);
      const result = await service.restore(into.id, { version: 1 }, userId);
      expect(result.id).toBe(into.id);
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } } });
      expect(legs.map((l) => l.lifecycle)).toEqual(['actual', 'actual']);
      expect(legs.map((l) => l.version)).toEqual([2, 2]);
    });

    it('rolls back the addressed leg when the sibling update fails mid-$transaction', async () => {
      const { out, into } = await makePair();
      // Genuine DB error on the sibling write: a trigger that raises
      // for that one row. No mocks — Postgres itself rejects the UPDATE.
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_sibling_update_trg ON transactions`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_sibling_update()`);
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION fail_sibling_update() RETURNS trigger AS $$
        BEGIN
          IF NEW.id = ${into.id} THEN RAISE EXCEPTION 'forced sibling failure'; END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER fail_sibling_update_trg BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION fail_sibling_update()`,
      );
      try {
        await expect(service.void(out.id, { version: 0 }, userId)).rejects.toThrow();
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_sibling_update_trg ON transactions`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_sibling_update()`);
      }
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } }, orderBy: { id: 'asc' } });
      expect(legs.map((l) => l.lifecycle)).toEqual(['actual', 'actual']);
      expect(legs.map((l) => l.version)).toEqual([0, 0]);
    });
  });

  describe('Epic 16 Story 2 — edit (PATCH)', () => {
    const makeTx = (overrides: Partial<Prisma.TransactionUncheckedCreateInput> = {}) =>
      prisma.transaction.create({
        data: {
          accountId,
          type: 'expense',
          amount: new Prisma.Decimal(-10),
          occurredOn: fromDateOnlyString('2020-01-01'),
          ...overrides,
        },
      });

    const makePair = async (siblingAccountId?: number) => {
      const second = siblingAccountId
        ? { id: siblingAccountId }
        : await prisma.account.create({
            data: { name: 'Second', currentBalance: new Prisma.Decimal(0), referenceDate: new Date(), openingBoundary: 'start_of_day', userId },
          });
      const transferId = '33333333-3333-3333-3333-333333333333';
      const out = await makeTx({ type: 'transfer', amount: new Prisma.Decimal(-50), transferId });
      const into = await makeTx({ accountId: second.id, type: 'transfer', amount: new Prisma.Decimal(50), transferId });
      return { out, into };
    };

    it('edits each field and increments version', async () => {
      const t = await makeTx();
      const r1 = await service.update(t.id, { version: 0, amount: -12.5 }, userId);
      expect(r1.amount).toBe('-12.5');
      expect(r1.version).toBe(1);
      const r2 = await service.update(t.id, { version: 1, occurredOn: '2020-02-02' }, userId);
      expect(r2.occurred_on).toBe('2020-02-02');
      const r3 = await service.update(t.id, { version: 2, category: 'Food' }, userId);
      expect(r3.category).toBe('Food');
      const r4 = await service.update(t.id, { version: 3, description: 'Lunch' }, userId);
      expect(r4.description).toBe('Lunch');
      expect(r4.version).toBe(4);
    });

    it('rejects an empty change set with 400', async () => {
      const t = await makeTx();
      await expect(service.update(t.id, { version: 0 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects a stale version with 409 and leaves the row unchanged', async () => {
      const t = await makeTx();
      await expect(service.update(t.id, { version: 9, category: 'X' }, userId)).rejects.toThrow(ConflictException);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.category).toBeNull();
      expect(after.version).toBe(0);
    });

    it('rejects editing a voided transaction with 400', async () => {
      const t = await makeTx({ lifecycle: 'voided' });
      await expect(service.update(t.id, { version: 0, category: 'X' }, userId)).rejects.toThrow('restore it first');
    });

    it('rejects a sign mismatch with 400', async () => {
      const exp = await makeTx();
      await expect(service.update(exp.id, { version: 0, amount: 5 }, userId)).rejects.toThrow(BadRequestException);
      const inc = await makeTx({ type: 'income', amount: new Prisma.Decimal(10) });
      await expect(service.update(inc.id, { version: 0, amount: -5 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects more than 2 decimals with 400', async () => {
      const t = await makeTx();
      await expect(service.update(t.id, { version: 0, amount: -1.005 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects a future date on an actual row with 400 but allows it on a planned row', async () => {
      const t = await makeTx();
      await expect(service.update(t.id, { version: 0, occurredOn: '2999-01-01' }, userId)).rejects.toThrow(BadRequestException);
      const p = await makeTx({ lifecycle: 'planned' });
      const r = await service.update(p.id, { version: 0, occurredOn: '2999-01-01' }, userId);
      expect(r.occurred_on).toBe('2999-01-01');
    });

    it("returns 404 for another user's transaction", async () => {
      const foreign = await prisma.transaction.create({
        data: { accountId: otherUserAccountId, type: 'expense', amount: new Prisma.Decimal(-1), occurredOn: fromDateOnlyString('2020-01-01') },
      });
      await expect(service.update(foreign.id, { version: 0, category: 'X' }, userId)).rejects.toThrow('Transaction not found');
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: foreign.id } });
      expect(after.category).toBeNull();
    });

    it('edits a transfer pair as a unit with opposite signs and bumps both versions', async () => {
      const { out, into } = await makePair();
      const r = await service.update(into.id, { version: 0, amount: 75, category: 'Savings', occurredOn: '2020-03-03' }, userId);
      expect(r.id).toBe(into.id);
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } }, orderBy: { id: 'asc' } });
      expect(legs.map((l) => l.amount.toString())).toEqual(['-75', '75']);
      expect(legs.map((l) => l.category)).toEqual(['Savings', 'Savings']);
      expect(legs.map((l) => toDateOnlyString(l.occurredOn))).toEqual(['2020-03-03', '2020-03-03']);
      expect(legs.map((l) => l.version)).toEqual([1, 1]);
    });

    it('rejects a zero amount (including -0) for expense and income with 400', async () => {
      const exp = await makeTx();
      const inc = await makeTx({ type: 'income', amount: new Prisma.Decimal(10) });
      await expect(service.update(exp.id, { version: 0, amount: -0 }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.update(exp.id, { version: 0, amount: 0 }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.update(inc.id, { version: 0, amount: 0 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-positive transfer magnitude with 400', async () => {
      const { out } = await makePair();
      await expect(service.update(out.id, { version: 0, amount: -75 }, userId)).rejects.toThrow(BadRequestException);
    });

    it('rolls back the addressed leg when the sibling update fails mid-$transaction', async () => {
      const { out, into } = await makePair();
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_edit_sibling_trg ON transactions`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_edit_sibling()`);
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION fail_edit_sibling() RETURNS trigger AS $$
        BEGIN
          IF NEW.id = ${into.id} THEN RAISE EXCEPTION 'forced sibling failure'; END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER fail_edit_sibling_trg BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION fail_edit_sibling()`,
      );
      try {
        await expect(service.update(out.id, { version: 0, amount: 99, category: 'X' }, userId)).rejects.toThrow();
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_edit_sibling_trg ON transactions`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_edit_sibling()`);
      }
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } }, orderBy: { id: 'asc' } });
      expect(legs.map((l) => l.amount.toString())).toEqual(['-50', '50']);
      expect(legs.map((l) => l.category)).toEqual([null, null]);
      expect(legs.map((l) => l.version)).toEqual([0, 0]);
    });

    it('fails and rolls back when the sibling leg belongs to another user (edit and void)', async () => {
      const { out, into } = await makePair(otherUserAccountId);
      await expect(service.update(out.id, { version: 0, category: 'X' }, userId)).rejects.toThrow(ConflictException);
      await expect(service.void(out.id, { version: 0 }, userId)).rejects.toThrow(ConflictException);
      const legs = await prisma.transaction.findMany({ where: { id: { in: [out.id, into.id] } }, orderBy: { id: 'asc' } });
      expect(legs.map((l) => l.category)).toEqual([null, null]);
      expect(legs.map((l) => l.lifecycle)).toEqual(['actual', 'actual']);
      expect(legs.map((l) => l.version)).toEqual([0, 0]);
    });
  });

  describe('Epic 16 Story 2 — impact-preview', () => {
    let accounts: AccountsService;
    let previewAccountId: number;
    let secondAccountId: number;

    beforeEach(async () => {
      const m = await Test.createTestingModule({
        providers: [AccountsService, PrismaService, ClockService],
      }).compile();
      accounts = m.get(AccountsService);
      // Fixed reference date well in the past so "post-reference" and
      // "pre-reference" rows are deterministic and never future-dated.
      const a = await prisma.account.create({
        data: { name: 'Preview', currentBalance: new Prisma.Decimal(100), referenceDate: fromDateOnlyString('2020-06-01'), openingBoundary: 'start_of_day', userId },
      });
      previewAccountId = a.id;
      const b = await prisma.account.create({
        data: { name: 'Preview2', currentBalance: new Prisma.Decimal(0), referenceDate: fromDateOnlyString('2020-06-01'), openingBoundary: 'start_of_day', userId },
      });
      secondAccountId = b.id;
    });

    const mk = (overrides: Partial<Prisma.TransactionUncheckedCreateInput> = {}) =>
      prisma.transaction.create({
        data: {
          accountId: previewAccountId,
          type: 'expense',
          amount: new Prisma.Decimal(-10),
          occurredOn: fromDateOnlyString('2020-07-01'),
          ...overrides,
        },
      });

    const balanceOf = async (id: number) =>
      (await accounts.findMine(userId)).find((x) => x.id === id)!.balance;

    it('edit amount on a post-reference row: delta equals the amount change', async () => {
      const t = await mk();
      const r = await service.impactPreview(t.id, { action: 'edit', amount: -25 }, userId);
      expect(r.transaction_id).toBe(t.id);
      expect(r.action).toBe('edit');
      expect(r.accounts).toHaveLength(1);
      expect(r.accounts[0]).toMatchObject({
        account_id: previewAccountId,
        balance_before: '90',
        balance_after: '75',
        delta: '-15',
        within_opening_snapshot: false,
      });
    });

    it('edit on a pre-reference row: delta 0, within_opening_snapshot true, explicit note', async () => {
      const t = await mk({ occurredOn: fromDateOnlyString('2020-01-01') });
      const r = await service.impactPreview(t.id, { action: 'edit', amount: -99 }, userId);
      expect(r.accounts[0].delta).toBe('0');
      expect(r.accounts[0].balance_before).toBe('100');
      expect(r.accounts[0].balance_after).toBe('100');
      expect(r.accounts[0].within_opening_snapshot).toBe(true);
      expect(r.accounts[0].note).toContain('reference date');
    });

    it('edit that moves a row from post- to pre-reference removes its effect', async () => {
      const t = await mk();
      const r = await service.impactPreview(t.id, { action: 'edit', occurredOn: '2020-01-01' }, userId);
      expect(r.accounts[0].delta).toBe('10');
      expect(r.accounts[0].within_opening_snapshot).toBe(true);
      expect(r.accounts[0].note).toBeDefined();
    });

    it('void: delta is minus the amount', async () => {
      const t = await mk();
      const r = await service.impactPreview(t.id, { action: 'void' }, userId);
      expect(r.accounts[0].delta).toBe('10');
      expect(r.accounts[0].balance_after).toBe('100');
    });

    it('restore of a voided row: delta is plus the amount', async () => {
      const t = await mk({ lifecycle: 'voided' });
      const r = await service.impactPreview(t.id, { action: 'restore' }, userId);
      expect(r.accounts[0].balance_before).toBe('100');
      expect(r.accounts[0].delta).toBe('-10');
      expect(r.accounts[0].balance_after).toBe('90');
    });

    it('transfer pair returns two accounts whose deltas sum to zero', async () => {
      const transferId = '33333333-3333-3333-3333-333333333333';
      const out = await mk({ type: 'transfer', amount: new Prisma.Decimal(-50), transferId });
      await mk({ accountId: secondAccountId, type: 'transfer', amount: new Prisma.Decimal(50), transferId });
      const v = await service.impactPreview(out.id, { action: 'void' }, userId);
      expect(v.accounts).toHaveLength(2);
      expect(v.accounts.map((a) => a.delta).sort()).toEqual(['-50', '50']);
      const e = await service.impactPreview(out.id, { action: 'edit', amount: 80 }, userId);
      const byAcc = Object.fromEntries(e.accounts.map((a) => [a.account_id, a.delta]));
      expect(byAcc[previewAccountId]).toBe('-30');
      expect(byAcc[secondAccountId]).toBe('30');
    });

    it('other user gets 404, same for a missing id', async () => {
      const foreign = await prisma.transaction.create({
        data: { accountId: otherUserAccountId, type: 'expense', amount: new Prisma.Decimal(-1), occurredOn: fromDateOnlyString('2020-07-01') },
      });
      await expect(service.impactPreview(foreign.id, { action: 'void' }, userId)).rejects.toThrow(NotFoundException);
      await expect(service.impactPreview(999999999, { action: 'void' }, userId)).rejects.toThrow(NotFoundException);
    });

    it('returns the same 400s as the real endpoints for invalid actions', async () => {
      const voided = await mk({ lifecycle: 'voided' });
      const live = await mk();
      await expect(service.impactPreview(voided.id, { action: 'void' }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.impactPreview(voided.id, { action: 'edit', amount: -5 }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.impactPreview(live.id, { action: 'restore' }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.impactPreview(live.id, { action: 'edit', amount: 5 }, userId)).rejects.toThrow(BadRequestException); // sign mismatch
      await expect(service.impactPreview(live.id, { action: 'edit', amount: -1.234 }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.impactPreview(live.id, { action: 'edit' }, userId)).rejects.toThrow(BadRequestException);
      await expect(service.impactPreview(live.id, { action: 'edit', occurredOn: '2999-01-01' }, userId)).rejects.toThrow(BadRequestException);
    });

    it('preview of void on a planned row is 400 like the real endpoint', async () => {
      const t = await mk({ lifecycle: 'planned' });
      await expect(service.impactPreview(t.id, { action: 'void' }, userId)).rejects.toThrow(BadRequestException);
    });

    it('performs no writes', async () => {
      const t = await mk();
      await service.impactPreview(t.id, { action: 'void' }, userId);
      await service.impactPreview(t.id, { action: 'edit', amount: -99 }, userId);
      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(after.lifecycle).toBe('actual');
      expect(after.version).toBe(0);
      expect(after.amount.toString()).toBe('-10');
    });

    it('cross-check: balance_after equals the real balance after actually voiding', async () => {
      const t = await mk({ amount: new Prisma.Decimal(-37.5) });
      const preview = await service.impactPreview(t.id, { action: 'void' }, userId);
      expect(preview.accounts[0].balance_before).toBe(await balanceOf(previewAccountId));
      await service.void(t.id, { version: 0 }, userId);
      expect(await balanceOf(previewAccountId)).toBe(preview.accounts[0].balance_after);
    });
  });
});

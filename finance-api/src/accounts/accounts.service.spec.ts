import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountsService } from './accounts.service.js';
import { ClockService } from '../common/clock.service.js';
import { fromDateOnlyString, todayDateOnly } from '../common/serialization.js';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: PrismaService;
  let userId: number;
  const testEmail = `accounts-prisma-test-${Date.now()}@example.com`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsService, PrismaService, ClockService],
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

  // S03.1 regression: legacy_inclusive accounts must keep the original
  // ">" formula unchanged by ADR 0002's fix — no silent reinterpretation
  // of an existing account's balance.
  it('legacy_inclusive: adds only transactions strictly after reference_date to the balance', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Balance test',
        currentBalance: new Prisma.Decimal('100.00'),
        referenceDate: fromDateOnlyString('2026-01-15'),
        openingBoundary: 'legacy_inclusive',
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

  // improvements.md F01 (P0): the default signup account is created with
  // currentBalance 0 and referenceDate = today (users.service.ts:36-43).
  // Because findMine's balance formula only adds transactions strictly
  // AFTER reference_date, a transaction recorded on signup day satisfies
  // neither term — it isn't in current_balance (0) and isn't in the SUM
  // (occurred_on = reference_date, not >). The inclusive-snapshot premise
  // documented above (line ~39) is false for a brand-new zero-balance
  // account: nothing was ever "already baked into" a balance of 0.
  //
  // EXPECTED (once F01 is fixed): a new-user account showing +1000 today
  // reports balance "1000". CURRENT (proves the finding): it reports "0".
  it('F01: same-day income on a fresh zero-balance account is reflected in balance', async () => {
    const today = todayDateOnly();

    const account = await prisma.account.create({
      data: {
        name: 'Fresh signup account',
        currentBalance: new Prisma.Decimal('0'),
        referenceDate: today,
        openingBoundary: 'start_of_day',
        userId,
      },
    });

    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'income',
        amount: new Prisma.Decimal('1000.00'),
        occurredOn: today,
      },
    });

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;

    expect(result.balance).toBe('1000');
  });

  // improvements.md F02 (P0): findMine's balance query has no upper bound
  // on occurred_on (accounts.service.ts:46-60) — the only date predicate
  // is `t.occurred_on > a.reference_date`. A transaction dated far in the
  // future is included in "current" balance exactly as if it had already
  // happened, even though create-transaction.dto.ts places no restriction
  // on future dates either.
  //
  // EXPECTED (once F02 is fixed): a transaction dated a year from now does
  // NOT inflate today's balance — balance stays "100". CURRENT (proves the
  // finding): the future transaction is included, balance is "5100".
  it('F02: a transaction dated far in the future inflates the current balance', async () => {
    const yesterday = fromDateOnlyString(
      toDateOnlyStringForOffset(todayDateOnly(), -1),
    );
    const farFuture = fromDateOnlyString(
      toDateOnlyStringForOffset(todayDateOnly(), 365),
    );

    const account = await prisma.account.create({
      data: {
        name: 'Future-dated test',
        currentBalance: new Prisma.Decimal('100.00'),
        referenceDate: yesterday,
        openingBoundary: 'legacy_inclusive',
        userId,
      },
    });

    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'income',
        amount: new Prisma.Decimal('5000.00'),
        occurredOn: farFuture,
      },
    });

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;

    expect(result.balance).toBe('100');
  });

  // Epic 14 Story 4: web needs opening_boundary to compute the
  // backdated-entry preview client-side (ADR 0002's two formulas),
  // without a second round trip per date the user picks.
  it('returns opening_boundary alongside the other account fields', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Boundary exposure test',
        currentBalance: new Prisma.Decimal('0'),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        userId,
      },
    });

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;

    expect(result.opening_boundary).toBe('start_of_day');
  });

  // S03.6: findMine must expose archived/protectedSavings so the web
  // accounts page can section/badge accounts without a second round trip.
  it('findMine returns archived and protectedSavings alongside the other account fields', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Savings',
        currentBalance: new Prisma.Decimal('0'),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        archived: true,
        protectedSavings: true,
        userId,
      },
    });

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;

    expect(result.archived).toBe(true);
    expect(result.protectedSavings).toBe(true);
  });

  // Epic 14 Sprint 2 Story 6 (closes S03.2): an unconfigured account's
  // "edit" is really its deferred initial configuration — completing it
  // flips configured to true so it stops being silently treated as a
  // real financial situation before the user has entered anything.
  it('update sets name/currentBalance/referenceDate and flips configured to true on an unconfigured account', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Cont curent',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-09-20'),
        openingBoundary: 'start_of_day',
        configured: false,
        userId,
      },
    });

    const updated = await service.update(
      account.id,
      { name: 'Revolut', currentBalance: 1500.75, referenceDate: '2026-09-24' },
      userId,
    );

    expect(updated.name).toBe('Revolut');
    expect(updated.current_balance).toBe('1500.75');
    expect(updated.reference_date).toBe('2026-09-24');
    expect(updated.configured).toBe(true);
  });

  // S03.7: an already-configured account's opening balance/reference date
  // can now be corrected directly (previewed client-side beforehand — see
  // web/lib/account-balance-preview.ts — not staged/validated server-side,
  // since the client already has everything needed to preview locally).
  // openingBoundary itself is never touched here (ADR 0002: permanent,
  // no conversion path) — this test proves the existing boundary formula
  // is honored against the CORRECTED snapshot, not just that the write
  // succeeds.
  it('update allows correcting currentBalance/referenceDate on an already-configured account, honoring its existing opening_boundary', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Cont curent',
        currentBalance: new Prisma.Decimal(100),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        userId,
      },
    });
    // Dated exactly on the corrected reference date — start_of_day's ">="
    // means this must be included in the recomputed balance.
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'income',
        amount: new Prisma.Decimal('50.00'),
        occurredOn: fromDateOnlyString('2026-02-01'),
      },
    });

    const updated = await service.update(
      account.id,
      { name: 'Cont curent', currentBalance: 999, referenceDate: '2026-02-01' },
      userId,
    );

    expect(updated.current_balance).toBe('999');
    expect(updated.reference_date).toBe('2026-02-01');

    const accounts = await service.findMine(userId);
    const result = accounts.find((a) => a.id === account.id)!;
    expect(result.balance).toBe('1049'); // 999 + 50, start_of_day >= includes 2026-02-01
  });

  it('update allows renaming an already-configured account when balance/date are unchanged', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Cont curent',
        currentBalance: new Prisma.Decimal(100),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        userId,
      },
    });

    const updated = await service.update(
      account.id,
      { name: 'Renamed', currentBalance: 100, referenceDate: '2026-01-01' },
      userId,
    );

    expect(updated.name).toBe('Renamed');
  });

  it('update rejects an account that does not belong to the caller', async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-${Date.now()}@example.com`, passwordHash: 'x' },
    });
    const otherAccount = await prisma.account.create({
      data: {
        name: 'Not yours',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: false,
        userId: otherUser.id,
      },
    });

    await expect(
      service.update(
        otherAccount.id,
        { name: 'Hijacked', currentBalance: 0, referenceDate: '2026-01-01' },
        userId,
      ),
    ).rejects.toThrow('Account does not belong to the current user');

    await prisma.account.delete({ where: { id: otherAccount.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  // S03.6: archive/unarchive + protected-savings are independent toggles
  // from update()'s configure-on-first-edit flow — they must work on an
  // already-configured account without touching balance/date.
  it('updateFlags sets archived on an already-configured account', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Cont curent',
        currentBalance: new Prisma.Decimal(100),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        userId,
      },
    });

    const updated = await service.updateFlags(account.id, { archived: true }, userId);

    expect(updated.archived).toBe(true);
    expect(updated.protectedSavings).toBe(false);
  });

  it('updateFlags sets protectedSavings without touching archived', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Savings',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        archived: false,
        userId,
      },
    });

    const updated = await service.updateFlags(account.id, { protectedSavings: true }, userId);

    expect(updated.protectedSavings).toBe(true);
    expect(updated.archived).toBe(false);
  });

  it('updateFlags sets both fields in one call', async () => {
    const account = await prisma.account.create({
      data: {
        name: 'Cont curent',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        userId,
      },
    });

    const updated = await service.updateFlags(
      account.id,
      { archived: true, protectedSavings: true },
      userId,
    );

    expect(updated.archived).toBe(true);
    expect(updated.protectedSavings).toBe(true);
  });

  it('updateFlags rejects an account that does not belong to the caller', async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-flags-${Date.now()}@example.com`, passwordHash: 'x' },
    });
    const otherAccount = await prisma.account.create({
      data: {
        name: 'Not yours',
        currentBalance: new Prisma.Decimal(0),
        referenceDate: fromDateOnlyString('2026-01-01'),
        openingBoundary: 'start_of_day',
        configured: true,
        userId: otherUser.id,
      },
    });

    await expect(
      service.updateFlags(otherAccount.id, { archived: true }, userId),
    ).rejects.toThrow('Account does not belong to the current user');

    await prisma.account.delete({ where: { id: otherAccount.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});

// Local helper — offsets a UTC-midnight Date by `days` (may be negative)
// and formats it back to "YYYY-MM-DD", entirely in UTC calendar math so it
// matches the UTC-anchored convention fromDateOnlyString/todayDateOnly use.
function toDateOnlyStringForOffset(base: Date, days: number): string {
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

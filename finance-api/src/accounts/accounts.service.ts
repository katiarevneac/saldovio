import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { ClockService } from '../common/clock.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';
import { UpdateAccountFlagsDto } from './dto/update-account-flags.dto.js';

type AccountWithBalanceRow = {
  id: number;
  name: string;
  current_balance: Prisma.Decimal;
  reference_date: Date;
  configured: boolean;
  opening_boundary: 'legacy_inclusive' | 'start_of_day';
  archived: boolean;
  protected_savings: boolean;
  balance: Prisma.Decimal;
};

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(dto: CreateAccountDto, userId: number) {
    const account = await this.prisma.account.create({
      data: {
        name: dto.name,
        currentBalance: new Prisma.Decimal(dto.currentBalance),
        referenceDate: fromDateOnlyString(dto.referenceDate),
        // A manually created account is explicitly configured by the
        // user who just typed its name/balance in — start_of_day per
        // ADR 0002 (every account created from here on is "new").
        openingBoundary: 'start_of_day',
        userId,
      },
    });

    return {
      id: account.id,
      name: account.name,
      current_balance: toDecimalString(account.currentBalance),
      reference_date: toDateOnlyString(account.referenceDate),
    };
  }

  // S03.2/Epic 14 Sprint 2 Story 6: an unconfigured account's "edit" is
  // its deferred initial configuration, completing it flips configured
  // to true. An already-configured account can only be renamed here —
  // changing its balance/reference date on an already-configured account
  // is S03.7's previewed reconciliation flow — the client shows the
  // recomputed balance before the user submits (web/lib/account-balance-
  // preview.ts), so the server doesn't need to block or re-stage the
  // write. openingBoundary itself is never part of this DTO and is never
  // touched here — ADR 0002: permanent per account, no conversion path.
  async update(id: number, dto: UpdateAccountDto, userId: number) {
    const existing = await this.prisma.account.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const account = await this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        currentBalance: new Prisma.Decimal(dto.currentBalance),
        referenceDate: fromDateOnlyString(dto.referenceDate),
        configured: true,
      },
    });

    return {
      id: account.id,
      name: account.name,
      current_balance: toDecimalString(account.currentBalance),
      reference_date: toDateOnlyString(account.referenceDate),
      configured: account.configured,
    };
  }

  // S03.6: archive/unarchive + protected-savings marking. Independent of
  // update()'s configure-on-first-edit flow — works on any account
  // regardless of `configured`, never touches balance/reference_date.
  async updateFlags(id: number, dto: UpdateAccountFlagsDto, userId: number) {
    const existing = await this.prisma.account.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const account = await this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
        ...(dto.protectedSavings !== undefined ? { protectedSavings: dto.protectedSavings } : {}),
      },
    });

    return {
      id: account.id,
      archived: account.archived,
      protectedSavings: account.protectedSavings,
    };
  }

  async findMine(userId: number) {
    // ADR 0002: two boundary conventions coexist on purpose.
    // legacy_inclusive accounts keep the original ">" comparison (a
    // transaction dated exactly on reference_date is already baked into
    // current_balance) so no existing balance is silently reinterpreted.
    // start_of_day accounts use ">=" so a transaction dated on
    // reference_date itself (typically "today", for a fresh account)
    // counts. Also closes F02: occurred_on <= calculationDate is now a
    // real upper bound, where calculationDate comes from the injected
    // clock (S00.7) rather than each call deriving "today" separately.
    // Kept as raw SQL — Prisma's query builder has no equivalent to a
    // FILTER-clause conditional aggregate, and the base query was already
    // validated in psql when first written (Sprint 4 S1).
    const calculationDate = this.clock.today();
    const rows = await this.prisma.$queryRaw<AccountWithBalanceRow[]>`
      SELECT
        a.id,
        a.name,
        a.current_balance,
        a.reference_date,
        a.configured,
        a.opening_boundary,
        a.archived,
        a.protected_savings,
        a.current_balance + COALESCE(
          SUM(t.amount) FILTER (
            WHERE t.occurred_on <= ${calculationDate}
              AND (
                (a.opening_boundary = 'legacy_inclusive' AND t.occurred_on > a.reference_date)
                OR (a.opening_boundary = 'start_of_day' AND t.occurred_on >= a.reference_date)
              )
          ), 0
        ) AS balance
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE a.user_id = ${userId}
      GROUP BY a.id
      ORDER BY a.id
    `;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      current_balance: toDecimalString(row.current_balance),
      reference_date: toDateOnlyString(row.reference_date),
      configured: row.configured,
      opening_boundary: row.opening_boundary,
      archived: row.archived,
      protectedSavings: row.protected_savings,
      balance: toDecimalString(row.balance),
    }));
  }
}

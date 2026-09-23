import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { ClockService } from '../common/clock.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';

type AccountWithBalanceRow = {
  id: number;
  name: string;
  current_balance: Prisma.Decimal;
  reference_date: Date;
  configured: boolean;
  opening_boundary: 'legacy_inclusive' | 'start_of_day';
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
      balance: toDecimalString(row.balance),
    }));
  }
}

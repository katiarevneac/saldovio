import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { CreateAccountDto } from './dto/create-account.dto.js';

type AccountWithBalanceRow = {
  id: number;
  name: string;
  current_balance: Prisma.Decimal;
  reference_date: Date;
  balance: Prisma.Decimal;
};

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccountDto, userId: number) {
    const account = await this.prisma.account.create({
      data: {
        name: dto.name,
        currentBalance: new Prisma.Decimal(dto.currentBalance),
        referenceDate: fromDateOnlyString(dto.referenceDate),
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
    // current_balance is defined as of reference_date, inclusive — a
    // transaction dated exactly on reference_date is already baked
    // into that figure. Only transactions strictly after it get added
    // on top, otherwise reference_date's own transactions would be
    // double-counted (brief §11 rule 4). Kept as raw SQL — Prisma's
    // query builder has no equivalent to a FILTER-clause conditional
    // aggregate, and this exact query was already validated in psql
    // when it was first written (Sprint 4 S1).
    const rows = await this.prisma.$queryRaw<AccountWithBalanceRow[]>`
      SELECT
        a.id,
        a.name,
        a.current_balance,
        a.reference_date,
        a.current_balance + COALESCE(
          SUM(t.amount) FILTER (WHERE t.occurred_on > a.reference_date), 0
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
      balance: toDecimalString(row.balance),
    }));
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto, userId: number) {
    // The account in the request body is client-supplied and must not
    // be trusted on its own — verify it actually belongs to the caller
    // before writing anything (brief §12 ownership check).
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn: fromDateOnlyString(dto.occurredOn),
        category: dto.category ?? null,
      },
    });

    return {
      id: transaction.id,
      account_id: transaction.accountId,
      type: transaction.type,
      amount: toDecimalString(transaction.amount),
      occurred_on: toDateOnlyString(transaction.occurredOn),
      category: transaction.category,
    };
  }

  async findAll(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { account: { userId } },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    return transactions.map((t) => ({
      id: t.id,
      account_id: t.accountId,
      type: t.type,
      amount: toDecimalString(t.amount),
      occurred_on: toDateOnlyString(t.occurredOn),
      category: t.category,
    }));
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString } from '../common/serialization.js';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto.js';

@Injectable()
export class RecurringRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRecurringRuleDto, userId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const rule = await this.prisma.recurringRule.create({
      data: {
        accountId: dto.accountId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        dayOfMonth: dto.dayOfMonth,
        category: dto.category ?? null,
      },
    });

    return {
      id: rule.id,
      account_id: rule.accountId,
      type: rule.type,
      amount: toDecimalString(rule.amount),
      frequency: rule.frequency,
      day_of_month: rule.dayOfMonth,
      category: rule.category,
      active: rule.active,
    };
  }

  async findAll(userId: number) {
    const rules = await this.prisma.recurringRule.findMany({
      where: { account: { userId }, active: true },
      orderBy: [{ dayOfMonth: 'asc' }, { id: 'asc' }],
    });

    return rules.map((r) => ({
      id: r.id,
      account_id: r.accountId,
      type: r.type,
      amount: toDecimalString(r.amount),
      frequency: r.frequency,
      day_of_month: r.dayOfMonth,
      category: r.category,
      active: r.active,
    }));
  }
}

import { ForbiddenException, Injectable } from '@nestjs/common';
import { pool } from '../database/pool.js';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto.js';

@Injectable()
export class RecurringRulesService {
  async create(dto: CreateRecurringRuleDto, userId: number) {
    const ownership = await pool.query(
      `SELECT id FROM accounts WHERE id = $1 AND user_id = $2`,
      [dto.accountId, userId],
    );
    if (ownership.rowCount === 0) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const result = await pool.query(
      `INSERT INTO recurring_rules (account_id, type, amount, day_of_month, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, type, amount, frequency, day_of_month, category, active`,
      [dto.accountId, dto.type, dto.amount, dto.dayOfMonth, dto.category ?? null],
    );

    return result.rows[0];
  }

  async findAll(userId: number) {
    const result = await pool.query(
      `SELECT r.id, r.account_id, r.type, r.amount, r.frequency, r.day_of_month, r.category, r.active
       FROM recurring_rules r
       JOIN accounts a ON a.id = r.account_id
       WHERE a.user_id = $1 AND r.active = true
       ORDER BY r.day_of_month, r.id`,
      [userId],
    );

    return result.rows;
  }
}

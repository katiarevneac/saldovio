import { ForbiddenException, Injectable } from '@nestjs/common';
import { pool } from '../database/pool.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';

@Injectable()
export class TransactionsService {
  async create(dto: CreateTransactionDto, userId: number) {
    // The account in the request body is client-supplied and must not
    // be trusted on its own — verify it actually belongs to the caller
    // before writing anything (brief §12 ownership check).
    const ownership = await pool.query(
      `SELECT id FROM accounts WHERE id = $1 AND user_id = $2`,
      [dto.accountId, userId],
    );
    if (ownership.rowCount === 0) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const result = await pool.query(
      `INSERT INTO transactions (account_id, type, amount, occurred_on, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, type, amount, occurred_on, category`,
      [dto.accountId, dto.type, dto.amount, dto.occurredOn, dto.category ?? null],
    );

    return result.rows[0];
  }

  async findAll(userId: number) {
    const result = await pool.query(
      `SELECT t.id, t.account_id, t.type, t.amount, t.occurred_on, t.category
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.user_id = $1
       ORDER BY t.occurred_on, t.id`,
      [userId],
    );

    return result.rows;
  }
}

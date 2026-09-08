import { Injectable } from '@nestjs/common';
import { pool } from '../database/pool.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';

@Injectable()
export class TransactionsService {
  async create(dto: CreateTransactionDto) {
    const result = await pool.query(
      `INSERT INTO transactions (account_id, type, amount, occurred_on, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, type, amount, occurred_on, category`,
      [dto.accountId, dto.type, dto.amount, dto.occurredOn, dto.category ?? null],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await pool.query(
      `SELECT id, account_id, type, amount, occurred_on, category
       FROM transactions
       ORDER BY occurred_on, id`,
    );

    return result.rows;
  }
}

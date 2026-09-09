import { Injectable } from '@nestjs/common';
import { pool } from '../database/pool.js';

@Injectable()
export class AccountsService {
  async findMine(userId: number) {
    const result = await pool.query(
      `SELECT id, name, current_balance, reference_date
       FROM accounts
       WHERE user_id = $1
       ORDER BY id`,
      [userId],
    );

    return result.rows;
  }
}

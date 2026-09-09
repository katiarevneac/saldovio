import { Injectable } from '@nestjs/common';
import { pool } from '../database/pool.js';

@Injectable()
export class AccountsService {
  async findMine(userId: number) {
    // current_balance is defined as of reference_date, inclusive — a
    // transaction dated exactly on reference_date is already baked
    // into that figure. Only transactions strictly after it get added
    // on top, otherwise reference_date's own transactions would be
    // double-counted (brief §11 rule 4).
    const result = await pool.query(
      `SELECT
         a.id,
         a.name,
         a.current_balance,
         a.reference_date,
         a.current_balance + COALESCE(
           SUM(t.amount) FILTER (WHERE t.occurred_on > a.reference_date), 0
         ) AS balance
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       WHERE a.user_id = $1
       GROUP BY a.id
       ORDER BY a.id`,
      [userId],
    );

    return result.rows;
  }
}

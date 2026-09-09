import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { pool } from '../database/pool.js';
import { CreateUserDto } from './dto/create-user.dto.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [dto.email, passwordHash],
      );
      const user = userResult.rows[0];

      // Every user needs an account to own before they can record a
      // transaction — created atomically with the user so a crash
      // between the two inserts can't leave an ownerless account or
      // an account-less user (brief §12, "atomicity for multi-step
      // writes that must succeed together").
      await client.query(
        `INSERT INTO accounts (name, current_balance, reference_date, user_id)
         VALUES ('Cont curent', 0, CURRENT_DATE, $1)`,
        [user.id],
      );

      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

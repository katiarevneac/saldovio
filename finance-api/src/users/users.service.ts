import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { pool } from '../database/pool.js';
import { CreateUserDto } from './dto/create-user.dto.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [dto.email, passwordHash],
      );

      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }
}

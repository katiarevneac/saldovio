import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { pool } from '../database/pool.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  async login(dto: LoginDto) {
    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [dto.email],
    );

    const user = result.rows[0];
    // Same "invalid credentials" message whether the email doesn't exist
    // or the password is wrong — distinguishing the two would let an
    // attacker enumerate registered emails.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email };
  }
}

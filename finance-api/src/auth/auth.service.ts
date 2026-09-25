import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

// A hash of a password nobody will ever type — used only so the
// unknown-email path still pays a real bcrypt.compare cost, closing the
// timing side-channel that would otherwise let an attacker distinguish
// "no such email" (fast) from "wrong password" (slow) by response time.
const DUMMY_HASH = await bcrypt.hash('not-a-real-password-used-only-for-timing', 10);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Same "invalid credentials" message whether the email doesn't exist
    // or the password is wrong — distinguishing the two would let an
    // attacker enumerate registered emails. bcrypt.compare always runs,
    // against a dummy hash when there's no real user, so the two paths
    // also cost the same amount of time.
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email };
  }
}

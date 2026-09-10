import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayDateOnly } from '../common/serialization.js';
import { CreateUserDto } from './dto/create-user.dto.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: dto.email, passwordHash },
          select: { id: true, email: true },
        });

        // Every user needs an account to own before they can record a
        // transaction — created atomically with the user so a crash
        // between the two writes can't leave an ownerless account or
        // an account-less user (brief §12, "atomicity for multi-step
        // writes that must succeed together").
        await tx.account.create({
          data: {
            name: 'Cont curent',
            currentBalance: new Prisma.Decimal(0),
            referenceDate: todayDateOnly(),
            userId: user.id,
          },
        });

        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }
}

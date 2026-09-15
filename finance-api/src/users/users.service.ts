import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayDateOnly, toDecimalString } from '../common/serialization.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

type SettingsRow = {
  essentialSpend: Prisma.Decimal | null;
  payday: number | null;
  horizonDays: number;
};

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

  async getSettings(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { essentialSpend: true, payday: true, horizonDays: true },
    });
    return this.serializeSettings(user);
  }

  async updateSettings(userId: number, dto: UpdateSettingsDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.essentialSpend !== undefined) {
      data.essentialSpend = dto.essentialSpend === null ? null : new Prisma.Decimal(dto.essentialSpend);
    }
    if (dto.payday !== undefined) {
      data.payday = dto.payday;
    }
    if (dto.horizonDays !== undefined) {
      data.horizonDays = dto.horizonDays;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { essentialSpend: true, payday: true, horizonDays: true },
    });
    return this.serializeSettings(user);
  }

  private serializeSettings(user: SettingsRow) {
    return {
      essential_spend: user.essentialSpend === null ? null : toDecimalString(user.essentialSpend),
      payday: user.payday,
      horizon_days: user.horizonDays,
    };
  }
}

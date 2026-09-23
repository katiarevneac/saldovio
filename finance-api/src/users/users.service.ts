import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString } from '../common/serialization.js';
import { ClockService } from '../common/clock.service.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

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
            referenceDate: this.clock.today(),
            openingBoundary: 'start_of_day',
            // S03.2: this account has no real balance yet — the user
            // hasn't told us anything about their actual finances. Not
            // presented as a configured financial situation until they
            // do (edit flow, Epic 14 Sprint 2 Story 6, flips this).
            configured: false,
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

  async deleteAccount(userId: number, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid password');
    }

    // Prisma's schema has no onDelete: Cascade (FKs are RESTRICT by
    // default, per Epic 7 S1's baseline review) — every dependent row
    // must be deleted explicitly, in FK-safe order, inside one
    // transaction so a crash mid-delete can never leave orphaned data
    // or a half-deleted user (brief §12 atomicity).
    await this.prisma.$transaction([
      this.prisma.recurringRule.deleteMany({ where: { account: { userId } } }),
      this.prisma.transaction.deleteMany({ where: { account: { userId } } }),
      this.prisma.account.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }

  private serializeSettings(user: SettingsRow) {
    return {
      essential_spend: user.essentialSpend === null ? null : toDecimalString(user.essentialSpend),
      payday: user.payday,
      horizon_days: user.horizonDays,
    };
  }
}

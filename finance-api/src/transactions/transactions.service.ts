import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { ClockService } from '../common/clock.service.js';
import { isBackdated } from '../common/backdated.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateVersionDto } from './dto/update-version.dto.js';
import { parseRevolutCsv, type ParsedRow } from './csv/revolut-parser.js';
import { csvEscape } from './csv/csv-escape.js';

export type ImportRowInput = {
  hash: string;
  occurredOn: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async create(dto: CreateTransactionDto, userId: number) {
    // The account in the request body is client-supplied and must not
    // be trusted on its own — verify it actually belongs to the caller
    // before writing anything (brief §12 ownership check).
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }

    const occurredOn = fromDateOnlyString(dto.occurredOn);
    // The Zod schema's .default('actual') only runs through
    // ZodValidationPipe at the HTTP boundary — a caller invoking this
    // method directly (as every unit test here does) bypasses it, so
    // this is normalized again here, same as `category` below.
    const lifecycle = dto.lifecycle ?? 'actual';
    // S03.5: an 'actual' entry dated after today can't have "already
    // happened" — reject it rather than silently accepting a
    // contradiction. 'planned' entries are exempt by definition.
    if (lifecycle === 'actual' && occurredOn.getTime() > this.clock.today().getTime()) {
      throw new BadRequestException(
        "occurredOn is in the future — an 'actual' transaction can't be dated after today. Use lifecycle: 'planned' instead.",
      );
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn,
        category: dto.category ?? null,
        lifecycle,
      },
    });

    return this.serialize(transaction);
  }

  async findAll(userId: number, includeVoided = false) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        account: { userId },
        ...(includeVoided ? {} : { lifecycle: { not: 'voided' } }),
      },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    return transactions.map((t) => this.serialize(t));
  }

  async void(id: number, dto: UpdateVersionDto, userId: number) {
    const row = await this.findOwned(id, userId);
    if (row.lifecycle === 'voided') {
      throw new BadRequestException('Transaction is already voided');
    }
    if (row.lifecycle !== 'actual' && row.lifecycle !== 'planned') {
      throw new BadRequestException(`A ${row.lifecycle} transaction cannot be voided`);
    }
    return this.changeLifecycle(row, dto.version, 'voided', userId);
  }

  async restore(id: number, dto: UpdateVersionDto, userId: number) {
    const row = await this.findOwned(id, userId);
    if (row.lifecycle !== 'voided') {
      throw new BadRequestException('Only a voided transaction can be restored');
    }
    // A restored transaction becomes 'actual', which can't be dated in
    // the future (same rule as create()).
    if (row.occurredOn.getTime() > this.clock.today().getTime()) {
      throw new BadRequestException(
        "occurredOn is in the future — an 'actual' transaction can't be dated after today.",
      );
    }
    return this.changeLifecycle(row, dto.version, 'actual', userId);
  }

  // Missing row and someone else's row are indistinguishable on purpose
  // (no existence leak).
  private async findOwned(id: number, userId: number) {
    const row = await this.prisma.transaction.findFirst({
      where: { id, account: { userId } },
    });
    if (!row) {
      throw new NotFoundException('Transaction not found');
    }
    return row;
  }

  // Version-checked lifecycle change. For a transfer, both legs move
  // together inside one $transaction: the addressed leg is
  // version-checked, the sibling follows by transferId.
  private async changeLifecycle(
    row: { id: number; transferId: string | null },
    version: number,
    lifecycle: 'actual' | 'voided',
    userId: number,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transaction.updateMany({
        where: { id: row.id, version },
        data: { lifecycle, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('Transaction was modified; re-fetch and retry');
      }
      if (row.transferId) {
        await tx.transaction.updateMany({
          where: { transferId: row.transferId, id: { not: row.id }, account: { userId } },
          data: { lifecycle, version: { increment: 1 } },
        });
      }
      return tx.transaction.findUniqueOrThrow({ where: { id: row.id } });
    });
    return this.serialize(updated);
  }

  // Single response shape for every endpoint that returns a
  // transaction (create/list/void/restore/edit).
  private serialize(t: {
    id: number;
    accountId: number;
    type: string;
    amount: Prisma.Decimal;
    occurredOn: Date;
    category: string | null;
    lifecycle: string;
    description: string | null;
    version: number;
    transferId: string | null;
  }) {
    return {
      id: t.id,
      account_id: t.accountId,
      type: t.type,
      amount: toDecimalString(t.amount),
      occurred_on: toDateOnlyString(t.occurredOn),
      category: t.category,
      lifecycle: t.lifecycle,
      description: t.description,
      version: t.version,
      transfer_id: t.transferId,
    };
  }

  async previewImport(accountId: number, file: Buffer, userId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { referenceDate: true, openingBoundary: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }
    const referenceDate = toDateOnlyString(account.referenceDate);
    const openingBoundary = account.openingBoundary as 'legacy_inclusive' | 'start_of_day';

    let rows: ParsedRow[];
    try {
      rows = parseRevolutCsv(file);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not parse CSV file',
      );
    }

    const candidateHashes = rows.filter((r) => r.status === 'valid').map((r) => r.hash);
    const existingHashes = new Set(
      candidateHashes.length
        ? (
            await this.prisma.transaction.findMany({
              where: { accountId, importHash: { in: candidateHashes } },
              select: { importHash: true },
            })
          ).map((t) => t.importHash)
        : [],
    );

    // A hash appearing twice within the same file (identical row
    // repeated, or an unlikely accidental collision) must not be
    // allowed to reach commitImport twice — the second occurrence is
    // flagged here rather than relying on commitImport to catch it,
    // so the preview the user sees already reflects what commit will
    // actually do.
    const seenInFile = new Set<string>();

    return {
      rows: rows.map((row) => {
        if (row.status !== 'valid') {
          return this.serializePreviewRow(row, referenceDate, openingBoundary);
        }
        if (existingHashes.has(row.hash)) {
          return this.serializePreviewRow(
            { ...row, status: 'duplicate', reason: 'Already imported' },
            referenceDate,
            openingBoundary,
          );
        }
        if (seenInFile.has(row.hash)) {
          return this.serializePreviewRow(
            { ...row, status: 'duplicate', reason: 'Duplicate row within this file' },
            referenceDate,
            openingBoundary,
          );
        }
        seenInFile.add(row.hash);
        return this.serializePreviewRow(row, referenceDate, openingBoundary);
      }),
    };
  }

  async commitImport(accountId: number, rows: ImportRowInput[], userId: number) {
    await this.assertOwnsAccount(accountId, userId);

    return this.prisma.$transaction(async (tx) => {
      const requestedHashes = rows.map((r) => r.hash);
      const existing = await tx.transaction.findMany({
        where: { accountId, importHash: { in: requestedHashes } },
        select: { importHash: true },
      });
      const existingHashes = new Set(existing.map((t) => t.importHash));

      const seen = new Set<string>();
      const toInsert = rows.filter((row) => {
        if (existingHashes.has(row.hash) || seen.has(row.hash)) {
          return false;
        }
        seen.add(row.hash);
        return true;
      });

      const created = await tx.transaction.createMany({
        data: toInsert.map((row) => ({
          accountId,
          type: row.type,
          amount: new Prisma.Decimal(row.amount),
          occurredOn: fromDateOnlyString(row.occurredOn),
          category: row.category,
          importHash: row.hash,
        })),
        skipDuplicates: true,
      });

      return { imported: created.count, skipped_duplicates: rows.length - created.count };
    });
  }

  async exportCsv(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { account: { userId } },
      include: { account: { select: { name: true } } },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    const header = 'date,account,type,amount,category';
    const lines = transactions.map((t) =>
      [
        toDateOnlyString(t.occurredOn),
        csvEscape(t.account.name),
        t.type,
        toDecimalString(t.amount),
        csvEscape(t.category ?? ''),
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  private async assertOwnsAccount(accountId: number, userId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException('Account does not belong to the current user');
    }
  }

  private serializePreviewRow(
    row: ParsedRow,
    referenceDate: string,
    openingBoundary: 'legacy_inclusive' | 'start_of_day',
  ) {
    return {
      hash: row.hash,
      status: row.status,
      description: row.description,
      occurred_on: row.occurredOn,
      type: row.type,
      amount: row.amount,
      category: row.category,
      reason: row.reason,
      // Only meaningful for an importable row — a duplicate/error/skipped
      // row never reaches commitImport, so whether it would have moved
      // the balance is moot (S03.4/ADR 0002).
      backdated:
        row.status === 'valid' && row.occurredOn
          ? isBackdated(row.occurredOn, referenceDate, openingBoundary)
          : null,
    };
  }
}

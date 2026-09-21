import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDecimalString, toDateOnlyString, fromDateOnlyString } from '../common/serialization.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
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
  constructor(private readonly prisma: PrismaService) {}

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

    const transaction = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn: fromDateOnlyString(dto.occurredOn),
        category: dto.category ?? null,
      },
    });

    return {
      id: transaction.id,
      account_id: transaction.accountId,
      type: transaction.type,
      amount: toDecimalString(transaction.amount),
      occurred_on: toDateOnlyString(transaction.occurredOn),
      category: transaction.category,
    };
  }

  async findAll(userId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { account: { userId } },
      orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    });

    return transactions.map((t) => ({
      id: t.id,
      account_id: t.accountId,
      type: t.type,
      amount: toDecimalString(t.amount),
      occurred_on: toDateOnlyString(t.occurredOn),
      category: t.category,
    }));
  }

  async previewImport(accountId: number, file: Buffer, userId: number) {
    await this.assertOwnsAccount(accountId, userId);

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
          return this.serializePreviewRow(row);
        }
        if (existingHashes.has(row.hash)) {
          return this.serializePreviewRow({ ...row, status: 'duplicate', reason: 'Already imported' });
        }
        if (seenInFile.has(row.hash)) {
          return this.serializePreviewRow({
            ...row,
            status: 'duplicate',
            reason: 'Duplicate row within this file',
          });
        }
        seenInFile.add(row.hash);
        return this.serializePreviewRow(row);
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

  private serializePreviewRow(row: ParsedRow) {
    return {
      hash: row.hash,
      status: row.status,
      description: row.description,
      occurred_on: row.occurredOn,
      type: row.type,
      amount: row.amount,
      category: row.category,
      reason: row.reason,
    };
  }
}

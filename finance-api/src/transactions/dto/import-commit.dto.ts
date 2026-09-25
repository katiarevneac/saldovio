import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ImportRowSchema = z.object({
  // hash is a sha256 hex digest (import-hash.ts's computeImportHash),
  // always exactly 64 characters — .max(64) closes an unbounded-string
  // DoS gap (improvements.md S04.15) without asserting an exact length.
  hash: z.string().min(1).max(64),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be in YYYY-MM-DD format'),
  type: z.enum(['income', 'expense']),
  // .multipleOf(0.01) is a deliberate addition beyond the plan's literal
  // schema (see task-6-report.md): the database column is NUMERIC(14,2),
  // so a 3-decimal-place amount (e.g. 12.505) would otherwise be silently
  // rounded on insert with no validation error telling the caller why.
  amount: z.number().multipleOf(0.01),
  category: z.string().max(200),
});

export const ImportCommitSchema = z.object({
  accountId: z.number().int(),
  // .max(5000) mirrors revolut-parser.ts's MAX_DATA_ROWS business
  // ceiling (improvements.md F18/S04.15) — that cap only applied to the
  // /import/preview path (which runs the parser); commit inserts the
  // client's rows directly with no equivalent bound of its own.
  rows: z.array(ImportRowSchema).min(1).max(5000),
});

export class ImportCommitDto extends createZodDto(ImportCommitSchema) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ImportRowSchema = z.object({
  hash: z.string().min(1),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be in YYYY-MM-DD format'),
  type: z.enum(['income', 'expense']),
  // .multipleOf(0.01) is a deliberate addition beyond the plan's literal
  // schema (see task-6-report.md): the database column is NUMERIC(14,2),
  // so a 3-decimal-place amount (e.g. 12.505) would otherwise be silently
  // rounded on insert with no validation error telling the caller why.
  amount: z.number().multipleOf(0.01),
  category: z.string(),
});

export const ImportCommitSchema = z.object({
  accountId: z.number().int(),
  rows: z.array(ImportRowSchema).min(1),
});

export class ImportCommitDto extends createZodDto(ImportCommitSchema) {}

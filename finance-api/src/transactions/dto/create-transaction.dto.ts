import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateTransactionSchema = z.object({
  accountId: z.number().int(),
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number(),
  // Date-only — same YYYY-MM-DD-only rule as CreateAccountDto.referenceDate,
  // for the same reason (see that schema's comment).
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be in YYYY-MM-DD format'),
  category: z.string().optional(),
});

export class CreateTransactionDto extends createZodDto(CreateTransactionSchema) {}

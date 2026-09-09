import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateRecurringRuleSchema = z.object({
  accountId: z.number().int(),
  type: z.enum(['income', 'expense']),
  // Stored as a positive magnitude, not signed like transactions — the
  // forecast formula applies the sign by type, not the stored value.
  amount: z.number().positive(),
  dayOfMonth: z.number().int().min(1).max(31),
  category: z.string().optional(),
});

export class CreateRecurringRuleDto extends createZodDto(CreateRecurringRuleSchema) {}

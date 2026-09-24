import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// S03.6: archived/protectedSavings toggle independently of
// UpdateAccountDto's configure-on-first-edit flow, and work on any
// account regardless of configured state.
export const UpdateAccountFlagsSchema = z
  .object({
    archived: z.boolean().optional(),
    protectedSavings: z.boolean().optional(),
  })
  .refine((data) => data.archived !== undefined || data.protectedSavings !== undefined, {
    message: 'At least one of archived or protectedSavings is required',
  });

export class UpdateAccountFlagsDto extends createZodDto(UpdateAccountFlagsSchema) {}

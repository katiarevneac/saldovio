import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateSettingsSchema = z.object({
  essentialSpend: z.number().nonnegative().nullable().optional(),
  payday: z.number().int().min(1).max(31).nullable().optional(),
  horizonDays: z.number().int().min(1).max(365).optional(),
});

export class UpdateSettingsDto extends createZodDto(UpdateSettingsSchema) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Body for void/restore: the caller proves which version of the row
// it last saw (optimistic concurrency, spec §5).
export const UpdateVersionSchema = z.object({
  version: z.number().int().min(0),
});

export class UpdateVersionDto extends createZodDto(UpdateVersionSchema) {}

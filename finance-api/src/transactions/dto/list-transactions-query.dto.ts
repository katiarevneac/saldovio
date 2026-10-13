import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListTransactionsQuerySchema = z.object({
  includeVoided: z.enum(['true', 'false']).optional(),
});

export class ListTransactionsQueryDto extends createZodDto(ListTransactionsQuerySchema) {}

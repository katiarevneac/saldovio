import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { calendarDateString } from './update-transaction.dto.js';

// Query for GET /transactions/:id/impact-preview (Epic 16 Story 2,
// spec §5). amount/occurredOn describe the proposed edit and are only
// meaningful for action=edit; amount arrives as a query string, hence
// the coercion.
export const ImpactPreviewQuerySchema = z.object({
  action: z.enum(['edit', 'void', 'restore']),
  amount: z.coerce.number().finite().optional(),
  occurredOn: calendarDateString.optional(),
});

export class ImpactPreviewQueryDto extends createZodDto(ImpactPreviewQuerySchema) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { fromDateOnlyString } from '../../common/serialization.js';

// Body for PATCH /transactions/:id (Epic 16 Story 2, spec §5).
// `version` proves which row version the caller last saw; at least one
// editable field must accompany it. Amount sign/decimal rules depend on
// the stored row, so the service enforces them.
export const UpdateTransactionSchema = z
  .object({
    version: z.number().int().min(0),
    amount: z.number().finite().optional(),
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'occurredOn must be in YYYY-MM-DD format')
      // Shape-only regex lets "2026-13-45" through; fromDateOnlyString
      // round-trips the components and throws on calendar-invalid dates.
      .refine((v) => {
        try {
          fromDateOnlyString(v);
          return true;
        } catch {
          return false;
        }
      }, 'occurredOn is not a valid calendar date')
      .optional(),
    category: z.string().max(200).optional(),
    description: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.amount !== undefined ||
      v.occurredOn !== undefined ||
      v.category !== undefined ||
      v.description !== undefined,
    { message: 'At least one of amount, occurredOn, category, description is required' },
  );

export class UpdateTransactionDto extends createZodDto(UpdateTransactionSchema) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Same shape as CreateAccountSchema — an unconfigured account's "edit"
// is really its deferred initial configuration (S03.2/Epic 14 Sprint 2
// Story 6), and an already-configured account's balance/date correction
// (S03.7) reuses the identical fields and endpoint. openingBoundary is
// deliberately absent from this DTO — ADR 0002: permanent per account,
// never user-editable.
export const UpdateAccountSchema = z.object({
  name: z.string().min(1),
  currentBalance: z.number(),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'referenceDate must be in YYYY-MM-DD format'),
});

export class UpdateAccountDto extends createZodDto(UpdateAccountSchema) {}

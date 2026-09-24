import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Same shape as CreateAccountSchema — an unconfigured account's "edit"
// is really its deferred initial configuration (S03.2/Epic 14 Sprint 2
// Story 6), so it takes the same three fields a fresh account would.
// AccountsService.update rejects currentBalance/referenceDate changes
// once the account is already configured (S03.7's previewed
// reconciliation flow, not built yet, owns correcting an active
// account's snapshot).
export const UpdateAccountSchema = z.object({
  name: z.string().min(1),
  currentBalance: z.number(),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'referenceDate must be in YYYY-MM-DD format'),
});

export class UpdateAccountDto extends createZodDto(UpdateAccountSchema) {}

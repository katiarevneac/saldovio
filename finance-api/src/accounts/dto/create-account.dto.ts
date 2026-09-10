import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateAccountSchema = z.object({
  name: z.string().min(1),
  currentBalance: z.number(),
  // Date-only, not full ISO8601 — @IsDateString() also accepted
  // timestamps like "2026-01-01T12:00:00Z", which fromDateOnlyString()
  // (finance-api/src/common/serialization.ts) can't handle and used to
  // fall through to an unhandled 500 instead of a clean 400 (fixed in
  // Epic 7 S1's final review). This regex preserves that fix.
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'referenceDate must be in YYYY-MM-DD format'),
});

export class CreateAccountDto extends createZodDto(CreateAccountSchema) {}

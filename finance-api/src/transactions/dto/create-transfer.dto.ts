import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { calendarDateString } from './update-transaction.dto.js';

// Body for POST /transactions/transfer (Epic 16 Story 3, spec §4).
// `amount` is a positive magnitude; the service derives each leg's sign
// and enforces the decimal/zero rules (shared with transfer edits).
export const CreateTransferSchema = z.object({
  sourceAccountId: z.number().int(),
  destinationAccountId: z.number().int(),
  amount: z.number().finite(),
  occurredOn: calendarDateString,
  category: z.string().max(200).optional(),
});

export class CreateTransferDto extends createZodDto(CreateTransferSchema) {}

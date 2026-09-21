import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DeleteAccountSchema = z.object({
  password: z.string().min(1),
});

export class DeleteAccountDto extends createZodDto(DeleteAccountSchema) {}

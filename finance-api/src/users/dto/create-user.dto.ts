import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}

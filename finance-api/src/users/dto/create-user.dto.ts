import { createZodDto } from 'nestjs-zod';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .refine((value) => !bcrypt.truncates(value), {
      message: 'Password exceeds the maximum supported length',
    }),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}

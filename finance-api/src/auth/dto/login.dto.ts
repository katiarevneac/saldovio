import { createZodDto } from 'nestjs-zod';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .refine((value) => !bcrypt.truncates(value), {
      message: 'Password exceeds the maximum supported length',
    }),
});

export class LoginDto extends createZodDto(LoginSchema) {}

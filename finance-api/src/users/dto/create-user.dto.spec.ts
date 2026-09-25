import { describe, expect, it } from 'vitest';
import { CreateUserSchema } from './create-user.dto.js';

describe('CreateUserSchema', () => {
  it('accepts a valid email and an 8+ character password', () => {
    const result = CreateUserSchema.safeParse({ email: 'a@b.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = CreateUserSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = CreateUserSchema.safeParse({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects a password bcrypt would truncate (>72 UTF-8 bytes)', () => {
    const tooLong = 'a'.repeat(73);
    const result = CreateUserSchema.safeParse({
      email: 'test@example.com',
      password: tooLong,
    });
    expect(result.success).toBe(false);
  });

  // improvements.md S04.15 — .email() has no built-in length cap (zod
  // accepts a 500,000-character string as a "valid" email, confirmed
  // directly), so an attacker could send a multi-megabyte email string.
  // 254 is RFC 5321's max total email length.
  it('rejects an email longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(250)}@b.com`;
    const result = CreateUserSchema.safeParse({ email: tooLong, password: 'password123' });
    expect(result.success).toBe(false);
  });
});

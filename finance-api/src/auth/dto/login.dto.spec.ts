import { describe, expect, it } from 'vitest';
import { LoginSchema } from './login.dto.js';

describe('LoginSchema', () => {
  it('accepts a valid email and any non-empty password', () => {
    const result = LoginSchema.safeParse({ email: 'a@b.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = LoginSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(false);
  });

  it('rejects a password bcrypt would truncate (>72 UTF-8 bytes)', () => {
    const tooLong = 'a'.repeat(73);
    const result = LoginSchema.safeParse({ email: 'a@b.com', password: tooLong });
    expect(result.success).toBe(false);
  });

  // improvements.md S04.15 — .email() has no built-in length cap (zod
  // accepts a 500,000-character string as a "valid" email, confirmed
  // directly), so an attacker could send a multi-megabyte email string.
  // 254 is RFC 5321's max total email length.
  it('rejects an email longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(250)}@b.com`;
    const result = LoginSchema.safeParse({ email: tooLong, password: 'x' });
    expect(result.success).toBe(false);
  });
});

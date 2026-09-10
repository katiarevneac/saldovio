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
});

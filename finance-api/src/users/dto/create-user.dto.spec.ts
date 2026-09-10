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
});

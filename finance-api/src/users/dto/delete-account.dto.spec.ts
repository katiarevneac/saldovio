import { describe, expect, it } from 'vitest';
import { DeleteAccountSchema } from './delete-account.dto.js';

describe('DeleteAccountSchema', () => {
  it('accepts a non-empty password', () => {
    const result = DeleteAccountSchema.safeParse({ password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing password', () => {
    const result = DeleteAccountSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string password', () => {
    const result = DeleteAccountSchema.safeParse({ password: '' });
    expect(result.success).toBe(false);
  });

  // improvements.md S04.15 — password had a .min(1) but no .max(), so an
  // attacker could send a multi-megabyte password string to this
  // security-sensitive comparison (unlike CreateUserSchema/LoginSchema,
  // this field has no bcrypt.truncates() refine, since it's compared
  // against an existing hash rather than hashed fresh for storage).
  it('rejects a password longer than 1024 characters', () => {
    const result = DeleteAccountSchema.safeParse({ password: 'x'.repeat(1025) });
    expect(result.success).toBe(false);
  });
});

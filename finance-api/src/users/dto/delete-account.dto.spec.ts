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
});

import { describe, expect, it } from 'vitest';
import { UpdateAccountFlagsSchema } from './update-account-flags.dto.js';

describe('UpdateAccountFlagsSchema', () => {
  it('accepts archived alone', () => {
    const result = UpdateAccountFlagsSchema.safeParse({ archived: true });
    expect(result.success).toBe(true);
  });

  it('accepts protectedSavings alone', () => {
    const result = UpdateAccountFlagsSchema.safeParse({ protectedSavings: true });
    expect(result.success).toBe(true);
  });

  it('accepts both fields together', () => {
    const result = UpdateAccountFlagsSchema.safeParse({ archived: true, protectedSavings: false });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body', () => {
    const result = UpdateAccountFlagsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean archived value', () => {
    const result = UpdateAccountFlagsSchema.safeParse({ archived: 'yes' });
    expect(result.success).toBe(false);
  });
});

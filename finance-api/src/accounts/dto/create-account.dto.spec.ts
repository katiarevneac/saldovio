import { describe, expect, it } from 'vitest';
import { CreateAccountSchema } from './create-account.dto.js';

describe('CreateAccountSchema', () => {
  it('accepts a valid account payload', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Cash', currentBalance: 100.5, referenceDate: '2026-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = CreateAccountSchema.safeParse({
      name: '', currentBalance: 100, referenceDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric currentBalance', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Cash', currentBalance: 'not-a-number', referenceDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a referenceDate with a full timestamp instead of YYYY-MM-DD', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Cash', currentBalance: 100, referenceDate: '2026-01-01T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  // improvements.md S04.15 — name had a .min(1) but no .max(), so an
  // attacker could send a multi-megabyte name string.
  it('rejects a name longer than 200 characters', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'x'.repeat(201), currentBalance: 100, referenceDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });
});

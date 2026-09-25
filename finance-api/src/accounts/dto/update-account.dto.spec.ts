import { describe, expect, it } from 'vitest';
import { UpdateAccountSchema } from './update-account.dto.js';

describe('UpdateAccountSchema', () => {
  it('accepts a valid full update payload', () => {
    const result = UpdateAccountSchema.safeParse({
      name: 'Cont curent', currentBalance: 1500.75, referenceDate: '2026-09-20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = UpdateAccountSchema.safeParse({
      name: '', currentBalance: 100, referenceDate: '2026-09-20',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric currentBalance', () => {
    const result = UpdateAccountSchema.safeParse({
      name: 'Cash', currentBalance: 'not-a-number', referenceDate: '2026-09-20',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a referenceDate with a full timestamp instead of YYYY-MM-DD', () => {
    const result = UpdateAccountSchema.safeParse({
      name: 'Cash', currentBalance: 100, referenceDate: '2026-09-20T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  // improvements.md S04.15 — name had a .min(1) but no .max(), so an
  // attacker could send a multi-megabyte name string.
  it('rejects a name longer than 200 characters', () => {
    const result = UpdateAccountSchema.safeParse({
      name: 'x'.repeat(201), currentBalance: 100, referenceDate: '2026-09-20',
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ImportCommitSchema } from './import-commit.dto.js';

const validRow = {
  hash: 'a'.repeat(64),
  occurredOn: '2026-09-10',
  type: 'expense' as const,
  amount: -12.5,
  category: 'Coffee',
};

describe('ImportCommitSchema', () => {
  it('accepts a valid payload with one row', () => {
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [validRow] }).success).toBe(true);
  });

  it('rejects an empty rows array', () => {
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [] }).success).toBe(false);
  });

  it('rejects a row with a malformed occurredOn', () => {
    const invalid = { ...validRow, occurredOn: '10-09-2026' };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });

  it('rejects a row with a type outside income/expense', () => {
    const invalid = { ...validRow, type: 'transfer' };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });

  it('rejects an amount with more than 2 decimal places', () => {
    const invalid = { ...validRow, amount: 12.505 };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });
});

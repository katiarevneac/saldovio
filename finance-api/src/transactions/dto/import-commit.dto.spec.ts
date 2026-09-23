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

  // improvements.md F18 (P0): `rows` has `.min(1)` but no `.max()`. The
  // 5000-row ceiling only exists in revolut-parser.ts's parser, which runs
  // on the /import/preview path — commit never calls the parser at all
  // (transactions.service.ts's commitImport inserts the client's rows
  // directly), so that cap does not apply here.
  //
  // EXPECTED (once F18 is fixed): an oversized rows array is rejected.
  // CURRENT (proves the finding): accepted (bounded only by the 5MB JSON
  // body limit, which a batch of small rows fits well under).
  it('F18: accepts an oversized rows array with no upper bound', () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({
      ...validRow,
      hash: `${i}`.padStart(64, '0'),
    }));
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows }).success).toBe(false);
  });
});

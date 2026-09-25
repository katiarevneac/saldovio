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

  // improvements.md S04.15 — category was a bare z.string() with no
  // .max(), so an attacker could send a multi-megabyte category string.
  it('rejects a row category longer than 200 characters', () => {
    const invalid = { ...validRow, category: 'x'.repeat(201) };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });

  // improvements.md S04.15 — hash had a .min(1) but no .max(). It's a
  // sha256 hex digest (import-hash.ts's computeImportHash), always
  // exactly 64 characters, so an unbounded max let an attacker send a
  // multi-megabyte hash string.
  it('rejects a row hash longer than 64 characters', () => {
    const invalid = { ...validRow, hash: 'a'.repeat(65) };
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows: [invalid] }).success).toBe(false);
  });

  // improvements.md F18 (P1) / S04.15: `rows` had `.min(1)` but no
  // `.max()`. The 5000-row ceiling only existed in revolut-parser.ts's
  // parser, which runs on the /import/preview path — commit never calls
  // the parser at all (transactions.service.ts's commitImport inserts
  // the client's rows directly), so that cap didn't apply here. Fixed
  // by mirroring the same 5000-row business ceiling on ImportCommitSchema
  // itself. This closes only the unbounded-array-size portion of F18;
  // F18's broader "review integrity of preview-to-commit flow" concern
  // (e.g. hashes not being cryptographically tied to a server-side
  // preview session) is a separate, unrelated question this bounds
  // audit does not address.
  it('rejects an oversized rows array (over the 5000-row business ceiling)', () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      ...validRow,
      hash: `${i}`.padStart(64, '0'),
    }));
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows }).success).toBe(false);
  });

  it('accepts exactly 5000 rows (the business ceiling itself)', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      ...validRow,
      hash: `${i}`.padStart(64, '0'),
    }));
    expect(ImportCommitSchema.safeParse({ accountId: 1, rows }).success).toBe(true);
  });
});

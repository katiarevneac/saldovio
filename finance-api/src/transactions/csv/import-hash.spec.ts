import { describe, expect, it } from 'vitest';
import { computeImportHash } from './import-hash.js';

const baseFields = {
  completedDate: '2026-09-10 14:32:00',
  description: 'Coffee Shop',
  amount: '-12.50',
  currency: 'RON',
  balance: '987.50',
};

describe('computeImportHash', () => {
  it('produces the same hash for the same fields', () => {
    expect(computeImportHash(baseFields)).toBe(computeImportHash({ ...baseFields }));
  });

  it('produces a different hash when any field differs', () => {
    const hash = computeImportHash(baseFields);
    expect(computeImportHash({ ...baseFields, amount: '-12.51' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, description: 'Coffee Shop 2' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, completedDate: '2026-09-11 14:32:00' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, currency: 'EUR' })).not.toBe(hash);
    expect(computeImportHash({ ...baseFields, balance: '987.51' })).not.toBe(hash);
  });

  it('a fee-row hash never collides with its main row, even when amount equals the fee', () => {
    const mainHash = computeImportHash({ ...baseFields, amount: '1.00' });
    const feeHash = computeImportHash({ ...baseFields, amount: '1.00', discriminator: 'fee' });
    expect(feeHash).not.toBe(mainHash);
  });

  it('returns a 64-character lowercase hex string (sha256)', () => {
    expect(computeImportHash(baseFields)).toMatch(/^[0-9a-f]{64}$/);
  });
});

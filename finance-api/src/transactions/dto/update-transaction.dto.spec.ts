import { describe, expect, it } from 'vitest';
import { UpdateTransactionSchema } from './update-transaction.dto.js';

describe('UpdateTransactionSchema', () => {
  it('accepts a valid date', () => {
    expect(UpdateTransactionSchema.safeParse({ version: 0, occurredOn: '2026-02-28' }).success).toBe(true);
  });

  it.each(['2026-13-45', '2026-02-30', '2026-9-10'])('rejects calendar-invalid or malformed date %s', (d) => {
    expect(UpdateTransactionSchema.safeParse({ version: 0, occurredOn: d }).success).toBe(false);
  });

  it('rejects an empty change set (version only)', () => {
    expect(UpdateTransactionSchema.safeParse({ version: 0 }).success).toBe(false);
  });

  it('accepts a single editable field', () => {
    expect(UpdateTransactionSchema.safeParse({ version: 0, category: 'Food' }).success).toBe(true);
  });
});

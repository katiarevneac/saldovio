import { describe, expect, it } from 'vitest';
import { CreateTransactionSchema } from './create-transaction.dto.js';

describe('CreateTransactionSchema', () => {
  const valid = { accountId: 1, type: 'expense' as const, amount: -75.2, occurredOn: '2026-09-10', category: 'Groceries' };

  it('accepts a valid transaction', () => {
    expect(CreateTransactionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid transaction with no category (optional)', () => {
    const { category, ...withoutCategory } = valid;
    expect(CreateTransactionSchema.safeParse(withoutCategory).success).toBe(true);
  });

  it('rejects a type outside income/expense/transfer', () => {
    expect(CreateTransactionSchema.safeParse({ ...valid, type: 'banana' }).success).toBe(false);
  });

  it('rejects a non-integer accountId', () => {
    expect(CreateTransactionSchema.safeParse({ ...valid, accountId: 1.5 }).success).toBe(false);
  });

  it('rejects an occurredOn with a full timestamp instead of YYYY-MM-DD', () => {
    expect(CreateTransactionSchema.safeParse({ ...valid, occurredOn: '2026-09-10T12:00:00Z' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { CreateTransactionSchema } from './create-transaction.dto.js';

describe('CreateTransactionSchema', () => {
  const valid = { accountId: 1, type: 'expense' as const, amount: -75.2, occurredOn: '2026-09-10', category: 'Groceries' };

  it('accepts a valid transaction', () => {
    expect(CreateTransactionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid transaction with no category (optional)', () => {
    const { category: _category, ...withoutCategory } = valid;
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

  // improvements.md F10 (P0): amount is a bare z.number() here, with no
  // .multipleOf(0.01) guard — unlike import-commit.dto.ts's ImportRowSchema,
  // which has one specifically because the destination column is
  // NUMERIC(14,2) and a 3-decimal amount is otherwise silently rounded on
  // insert with no validation error (see that DTO's own comment). This
  // manual-entry path writes to the exact same column
  // (schema.prisma — Transaction.amount @db.Decimal(14, 2)) but has no
  // equivalent guard.
  //
  // EXPECTED (once F10 is fixed): a 3-decimal amount is rejected here too.
  // CURRENT (proves the finding): it's accepted, then silently rounded by
  // Postgres on insert.
  it('F10: accepts a 3-decimal-place amount, which the NUMERIC(14,2) column would silently round', () => {
    expect(CreateTransactionSchema.safeParse({ ...valid, amount: -12.505 }).success).toBe(false);
  });

  // improvements.md F10 (P0): sign is never validated against type — an
  // 'income' transaction with a negative amount is accepted, even though
  // downstream aggregation (web/lib/overview-metrics.ts's
  // `incomeBani + expenseBani`) assumes income arrives positive and
  // expense arrives already-negative.
  //
  // EXPECTED (once F10 is fixed): a sign/type mismatch is rejected here.
  // CURRENT (proves the finding): it's accepted.
  it('F10: accepts a negative amount on an income-type transaction (sign/type mismatch)', () => {
    expect(
      CreateTransactionSchema.safeParse({ ...valid, type: 'income', amount: -500 }).success,
    ).toBe(false);
  });
});

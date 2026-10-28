import { describe, expect, it } from 'vitest';
import { CreateTransferSchema } from './create-transfer.dto.js';

const valid = { sourceAccountId: 1, destinationAccountId: 2, amount: 50, occurredOn: '2026-02-28' };

describe('CreateTransferSchema', () => {
  it('accepts a valid transfer', () => {
    expect(CreateTransferSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional category', () => {
    expect(CreateTransferSchema.safeParse({ ...valid, category: 'Savings' }).success).toBe(true);
  });

  it.each(['2026-13-45', '2026-02-30', '2026-9-10'])('rejects invalid date %s', (d) => {
    expect(CreateTransferSchema.safeParse({ ...valid, occurredOn: d }).success).toBe(false);
  });

  it.each(['sourceAccountId', 'destinationAccountId', 'amount', 'occurredOn'] as const)(
    'rejects a missing %s',
    (field) => {
      const { [field]: _omit, ...rest } = valid;
      expect(CreateTransferSchema.safeParse(rest).success).toBe(false);
    },
  );

  it('rejects a category over 200 chars', () => {
    expect(CreateTransferSchema.safeParse({ ...valid, category: 'x'.repeat(201) }).success).toBe(false);
  });
});

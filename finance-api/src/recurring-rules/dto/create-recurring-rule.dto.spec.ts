import { describe, expect, it } from 'vitest';
import { CreateRecurringRuleSchema } from './create-recurring-rule.dto.js';

describe('CreateRecurringRuleSchema', () => {
  const valid = { accountId: 1, type: 'expense' as const, amount: 250, dayOfMonth: 1, category: 'Rent' };

  it('accepts a valid recurring rule', () => {
    expect(CreateRecurringRuleSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero or negative amount (must be positive, unlike transactions)', () => {
    expect(CreateRecurringRuleSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(CreateRecurringRuleSchema.safeParse({ ...valid, amount: -10 }).success).toBe(false);
  });

  it('rejects dayOfMonth outside 1-31', () => {
    expect(CreateRecurringRuleSchema.safeParse({ ...valid, dayOfMonth: 0 }).success).toBe(false);
    expect(CreateRecurringRuleSchema.safeParse({ ...valid, dayOfMonth: 32 }).success).toBe(false);
  });

  it('rejects a type outside income/expense (no "transfer" here, unlike transactions)', () => {
    expect(CreateRecurringRuleSchema.safeParse({ ...valid, type: 'transfer' }).success).toBe(false);
  });
});

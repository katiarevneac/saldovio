import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import {
  toDecimalString,
  toDateOnlyString,
  fromDateOnlyString,
  todayDateOnly,
} from './serialization.js';

describe('toDecimalString', () => {
  it('returns an exact decimal string, not a JS number', () => {
    const value = new Prisma.Decimal('1234.50');
    const result = toDecimalString(value);
    // Decimal.js's .toString() drops non-significant trailing zeros
    // (same documented behavior as the '-75.20' -> '-75.2' case below) —
    // '1234.50' normalizes to '1234.5', not a precision loss.
    expect(result).toBe('1234.5');
    expect(typeof result).toBe('string');
  });

  it('preserves a negative sign', () => {
    expect(toDecimalString(new Prisma.Decimal('-75.20'))).toBe('-75.2');
  });
});

describe('toDateOnlyString', () => {
  it('does not shift the calendar day across timezones', () => {
    const value = new Date('2026-09-10T00:00:00.000Z');
    expect(toDateOnlyString(value)).toBe('2026-09-10');
  });
});

describe('fromDateOnlyString', () => {
  it('round-trips through toDateOnlyString unchanged', () => {
    const date = fromDateOnlyString('2026-09-10');
    expect(toDateOnlyString(date)).toBe('2026-09-10');
  });
});

describe('todayDateOnly', () => {
  it('matches the local calendar date at call time', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(toDateOnlyString(todayDateOnly())).toBe(expected);
  });
});

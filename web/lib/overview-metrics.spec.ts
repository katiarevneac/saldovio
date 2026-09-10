import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMonthlyTotals, currentYearMonth } from "./overview-metrics";
import type { Transaction } from "./transactions";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    account_id: 1,
    type: "income",
    amount: "0.00",
    occurred_on: "2026-09-01",
    category: null,
    ...overrides,
  };
}

describe("computeMonthlyTotals", () => {
  it("sums income and expense transactions within the given month", () => {
    const transactions = [
      tx({ id: 1, type: "income", amount: "1200.00", occurred_on: "2026-09-05" }),
      tx({ id: 2, type: "expense", amount: "-350.50", occurred_on: "2026-09-12" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result.incomeBani).toBe(120000);
    expect(result.expenseBani).toBe(-35050);
    expect(result.surplusBani).toBe(84950);
  });

  it("excludes transactions outside the given month", () => {
    const transactions = [
      tx({ id: 1, type: "income", amount: "500.00", occurred_on: "2026-08-31" }),
      tx({ id: 2, type: "income", amount: "500.00", occurred_on: "2026-10-01" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });

  it("excludes transfers from income and expense totals", () => {
    const transactions = [
      tx({ id: 1, type: "transfer", amount: "-1000.00", occurred_on: "2026-09-10" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });

  it("returns all-zero totals when there are no transactions", () => {
    const result = computeMonthlyTotals([], "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });
});

describe("currentYearMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the local year and month, zero-padded", () => {
    vi.setSystemTime(new Date(2026, 2, 15));

    expect(currentYearMonth()).toBe("2026-03");
  });
});

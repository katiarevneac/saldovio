import { describe, expect, it } from "vitest";
import { computeBalancePreview } from "./account-balance-preview";

describe("computeBalancePreview", () => {
  it("returns the opening balance unchanged when there are no transactions", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-01",
      openingBoundary: "start_of_day",
      transactions: [],
      today: "2026-06-01",
    });

    expect(result).toBe(10000);
  });

  it("legacy_inclusive: excludes a transaction dated exactly on the reference date", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-15",
      openingBoundary: "legacy_inclusive",
      transactions: [{ occurredOn: "2026-01-15", amountBani: -2000 }],
      today: "2026-06-01",
    });

    expect(result).toBe(10000);
  });

  it("start_of_day: includes a transaction dated exactly on the reference date", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-15",
      openingBoundary: "start_of_day",
      transactions: [{ occurredOn: "2026-01-15", amountBani: -2000 }],
      today: "2026-06-01",
    });

    expect(result).toBe(8000);
  });

  it("excludes a transaction dated before the reference date, under either boundary", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-15",
      openingBoundary: "start_of_day",
      transactions: [{ occurredOn: "2026-01-14", amountBani: 5000 }],
      today: "2026-06-01",
    });

    expect(result).toBe(10000);
  });

  it("excludes a transaction dated after today", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-01",
      openingBoundary: "start_of_day",
      transactions: [{ occurredOn: "2026-12-31", amountBani: 5000 }],
      today: "2026-06-01",
    });

    expect(result).toBe(10000);
  });

  it("sums multiple qualifying transactions", () => {
    const result = computeBalancePreview({
      currentBalanceBani: 10000,
      referenceDate: "2026-01-01",
      openingBoundary: "start_of_day",
      transactions: [
        { occurredOn: "2026-01-01", amountBani: 500 },
        { occurredOn: "2026-02-01", amountBani: -300 },
        { occurredOn: "2025-12-31", amountBani: 999999 }, // before reference date, excluded
      ],
      today: "2026-06-01",
    });

    expect(result).toBe(10200);
  });
});

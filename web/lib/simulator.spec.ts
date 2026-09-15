import { describe, expect, it } from "vitest";
import {
  simulatePurchase,
  monthlyRuleOccurrences,
  TIGHT_THRESHOLD_NUMERATOR,
  TIGHT_THRESHOLD_DENOMINATOR,
} from "./simulator";
import type { RecurringRule } from "./recurring-rules";

function buildRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    type: "expense",
    amount: "50.00",
    frequency: "monthly",
    day_of_month: 10,
    category: "Rent",
    active: true,
    ...overrides,
  };
}

describe("monthlyRuleOccurrences", () => {
  it("finds a rule occurring twice in one window near a month boundary", () => {
    const rule = buildRule({ day_of_month: 1 });
    const occurrences = monthlyRuleOccurrences([rule], "2026-01-31", "2026-03-02");

    expect(occurrences.map((o) => o.date)).toEqual(["2026-02-01", "2026-03-01"]);
  });

  it("clamps day_of_month 31 to the last real day of a shorter month", () => {
    const rule = buildRule({ day_of_month: 31 });
    const occurrences = monthlyRuleOccurrences([rule], "2026-02-01", "2026-03-01");

    expect(occurrences.map((o) => o.date)).toEqual(["2026-02-28"]);
  });

  it("includes an occurrence landing exactly on the inclusive window start", () => {
    const rule = buildRule({ day_of_month: 1 });
    const occurrences = monthlyRuleOccurrences([rule], "2026-01-01", "2026-02-01");

    expect(occurrences.map((o) => o.date)).toEqual(["2026-01-01"]);
  });
});

describe("simulatePurchase", () => {
  it("builds a 31-point series covering [calculationDate, calculationDate + 30] inclusive", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
    });

    expect(result.baseSeries).toHaveLength(31);
    expect(result.baseSeries[0].date).toBe("2026-01-01");
    expect(result.baseSeries[30].date).toBe("2026-01-31");
    expect(result.windowEndDate).toBe("2026-01-31");
  });

  it("subtracts the purchase amount from every day of the after series", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 20000,
      calculationDate: "2026-01-01",
    });

    for (let i = 0; i < result.baseSeries.length; i++) {
      const baseBani = Math.round(Number(result.baseSeries[i].balance) * 100);
      const afterBani = Math.round(Number(result.afterSeries[i].balance) * 100);
      expect(afterBani).toBe(baseBani - 20000);
    }
  });

  it("finds the minimum after-purchase balance at a mid-window expense occurrence", () => {
    const rule = buildRule({ day_of_month: 10, amount: "500.00", type: "expense" });
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [rule],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
    });

    expect(result.minimumAfterDate).toBe("2026-01-10");
    expect(result.minimumAfterBani).toBe(50000);
  });

  it("verdict is 'tight' when the minimum after-purchase balance is exactly 0", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 100000,
      calculationDate: "2026-01-01",
    });

    expect(result.minimumAfterBani).toBe(0);
    expect(result.verdict).toBe("tight");
  });

  it("verdict is 'yes' when the minimum after-purchase balance is exactly at the 10% threshold", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 100000 - (100000 * TIGHT_THRESHOLD_NUMERATOR) / TIGHT_THRESHOLD_DENOMINATOR,
      calculationDate: "2026-01-01",
    });

    expect(result.minimumAfterBani).toBe(10000);
    expect(result.verdict).toBe("yes");
  });

  it("verdict is 'no' when the minimum after-purchase balance is negative", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 100001,
      calculationDate: "2026-01-01",
    });

    expect(result.minimumAfterBani).toBe(-1);
    expect(result.verdict).toBe("no");
  });

  it("applies a rule occurring exactly on calculationDate to day 0 of the series", () => {
    const rule = buildRule({ day_of_month: 14, amount: "300.00", type: "expense" });
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [rule],
      purchaseBani: 0,
      calculationDate: "2026-09-14",
    });

    const dayZeroBani = Math.round(Number(result.baseSeries[0].balance) * 100);
    expect(dayZeroBani).toBe(70000);
  });

  it("uses an explicit windowEndDate instead of the default 30-day window when provided", () => {
    const rule = buildRule({ day_of_month: 15, amount: "200.00", type: "expense" });
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [rule],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
      windowEndDate: "2026-02-20",
    });

    expect(result.windowEndDate).toBe("2026-02-20");
    expect(result.baseSeries[result.baseSeries.length - 1].date).toBe("2026-02-20");

    // The rule occurs on both 2026-01-15 and 2026-02-15 inside this extended
    // window; the default 30-day window (ending 2026-01-31) would only catch
    // the first occurrence.
    const finalBani = Math.round(
      Number(result.baseSeries[result.baseSeries.length - 1].balance) * 100
    );
    expect(finalBani).toBe(100000 - 20000 - 20000);
  });
});

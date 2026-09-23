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

  it("finds every occurrence in a window spanning more than 3 calendar months", () => {
    // horizonDays is settable up to 365 via /settings, so a window can span
    // far more than the 2-3 months the old iteration ceiling assumed.
    const rule = buildRule({ day_of_month: 15 });
    const occurrences = monthlyRuleOccurrences([rule], "2026-01-01", "2026-07-01");

    expect(occurrences.map((o) => o.date)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
    ]);
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

  it("uses essentialSpendBani as the 'tight' threshold instead of the 10% rule when it is set", () => {
    // No purchase, no rules: the minimum after-purchase balance is the full
    // 1000 RON. The 10% rule (threshold 100 RON) would call this "yes";
    // an essential spend of 1500 RON means it does not cover the month.
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
      essentialSpendBani: 150000,
    });

    expect(result.minimumAfterBani).toBe(100000);
    expect(result.verdict).toBe("tight");
  });

  it("verdict is 'yes' when the minimum after-purchase balance is exactly at essentialSpendBani", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
      essentialSpendBani: 100000,
    });

    expect(result.verdict).toBe("yes");
  });

  it("an explicit essentialSpendBani of null reproduces the 10%-rule behavior exactly", () => {
    // Same inputs as the "exactly at the 10% threshold" test above, which
    // passes no essentialSpendBani at all — both must reach the same verdict.
    const args = {
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani:
        100000 - (100000 * TIGHT_THRESHOLD_NUMERATOR) / TIGHT_THRESHOLD_DENOMINATOR,
      calculationDate: "2026-01-01",
    };

    const explicitNull = simulatePurchase({ ...args, essentialSpendBani: null });
    const omitted = simulatePurchase(args);

    expect(explicitNull.minimumAfterBani).toBe(10000);
    expect(explicitNull.verdict).toBe("yes");
    expect(explicitNull.verdict).toBe(omitted.verdict);
  });

  it("verdict stays 'no' below zero even when essentialSpendBani is set", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 100001,
      calculationDate: "2026-01-01",
      essentialSpendBani: 50000,
    });

    expect(result.verdict).toBe("no");
  });

  it("reports thresholdBasis as 'essential-spend' when essentialSpendBani is set", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
      essentialSpendBani: 150000,
    });

    expect(result.thresholdBasis).toBe("essential-spend");
  });

  it("reports thresholdBasis as 'balance-percent' when essentialSpendBani is null or omitted", () => {
    const omitted = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
    });
    const explicitNull = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 0,
      calculationDate: "2026-01-01",
      essentialSpendBani: null,
    });

    expect(omitted.thresholdBasis).toBe("balance-percent");
    expect(explicitNull.thresholdBasis).toBe("balance-percent");
  });

  // improvements.md F08 (P0): simulatePurchase has no transactions/spending-
  // history input at all — with zero recurring rules and no essentialSpend
  // set, the only signal it has is currentBalanceBani, so a purchase of any
  // size under the provisional 10%-of-balance threshold returns a flat
  // "yes" regardless of how much real (non-recurring) spending the user
  // actually does. This models exactly that: a 90%-of-balance purchase,
  // with the user's spending data entirely missing.
  //
  // EXPECTED (once F08 is fixed): the result does not claim an unqualified
  // "yes" when there is no real basis (no rules, no essential-spend floor)
  // for that confidence — at minimum it should not be indistinguishable
  // from a verdict backed by real data.
  // CURRENT (proves the finding): verdict is "yes".
  it("F08: a large purchase with zero spending data (no rules, no essentialSpend) still returns an unqualified 'yes'", () => {
    const result = simulatePurchase({
      currentBalanceBani: 100000,
      recurringRules: [],
      purchaseBani: 90000,
      calculationDate: "2026-01-01",
    });

    expect(result.verdict).not.toBe("yes");
  });
});

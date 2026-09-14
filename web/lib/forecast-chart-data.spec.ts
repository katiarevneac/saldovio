import { describe, expect, it } from "vitest";
import { toBaniPoints, findMinimum, groupIntoWeeks } from "./forecast-chart-data";
import type { RecurringRule } from "./recurring-rules";

function buildRule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    type: "expense",
    amount: "100.00",
    frequency: "monthly",
    day_of_month: 15,
    category: "Rent",
    active: true,
    ...overrides,
  };
}

describe("toBaniPoints", () => {
  it("converts decimal-string balances to integer bani, preserving order", () => {
    const points = toBaniPoints([
      { date: "2026-09-10", balance: "1000.00" },
      { date: "2026-09-11", balance: "975.50" },
      { date: "2026-09-12", balance: "-12.34" },
    ]);
    expect(points).toEqual([
      { date: "2026-09-10", bani: 100000 },
      { date: "2026-09-11", bani: 97550 },
      { date: "2026-09-12", bani: -1234 },
    ]);
  });

  it("returns an empty array for an empty series", () => {
    expect(toBaniPoints([])).toEqual([]);
  });
});

describe("findMinimum", () => {
  it("returns the point with the lowest bani value", () => {
    const points = [
      { date: "2026-09-10", bani: 1000 },
      { date: "2026-09-11", bani: -500 },
      { date: "2026-09-12", bani: 200 },
    ];
    expect(findMinimum(points)).toEqual({ date: "2026-09-11", bani: -500 });
  });

  it("returns the first occurrence when several points tie for the minimum", () => {
    const points = [
      { date: "2026-09-10", bani: -500 },
      { date: "2026-09-11", bani: -500 },
    ];
    expect(findMinimum(points)).toEqual({ date: "2026-09-10", bani: -500 });
  });

  it("returns null for an empty series (brief §11 rule 6 — no fabricated minimum)", () => {
    expect(findMinimum([])).toBeNull();
  });
});

describe("groupIntoWeeks", () => {
  // A single day-of-month value can't safely walk 31 days without
  // rolling into the next month — use a fixed array of valid dates
  // spanning two months instead of computing them arithmetically.
  function buildSeries(): { date: string; bani: number }[] {
    const dates = [
      ...Array.from({ length: 21 }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`), // 09-10..09-30
      ...Array.from({ length: 10 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`), // 10-01..10-10
    ];
    return dates.map((date, day) => ({ date, bani: 100000 + day * 10 }));
  }

  it("always returns exactly 5 buckets", () => {
    expect(groupIntoWeeks(buildSeries(), [])).toHaveLength(5);
    expect(groupIntoWeeks([], [])).toHaveLength(5);
    expect(groupIntoWeeks([{ date: "2026-09-10", bani: 100 }], [])).toHaveLength(5);
  });

  it("chunks a 31-point series into buckets of 7 days, last bucket smaller", () => {
    const series = buildSeries();
    const buckets = groupIntoWeeks(series, []);
    expect(buckets[0].startDate).toBe(series[0].date);
    expect(buckets[0].endDate).toBe(series[6].date);
    expect(buckets[3].startDate).toBe(series[21].date);
    expect(buckets[4].startDate).toBe(series[28].date);
    expect(buckets[4].endDate).toBe(series[30].date);
  });

  it("gives every bucket zero in/out when no recurring rules are passed", () => {
    const buckets = groupIntoWeeks(buildSeries(), []);
    for (const bucket of buckets) {
      expect(bucket.inBani).toBe(0);
      expect(bucket.outBani).toBe(0);
    }
  });

  // Regression test for the bug this fix addresses: groupIntoWeeks used
  // to derive in/out totals from day-over-day balance deltas, and
  // explicitly skipped day 0 (the series' first point) because it has
  // no prior point to diff against. But a rule landing exactly on day 0
  // (today) is already baked into dailyBalances[0]'s balance by the
  // backend — so the old delta-based code silently dropped it from the
  // in/out breakdown while still reflecting it in endBalanceBani, and
  // Calendar mode (which uses occurrencesInWindow, like this function
  // now does) showed it correctly. This test would have failed under
  // the old implementation (bucket 0's inBani would have been 0).
  it("counts a rule occurring on day 0 (today) in bucket 0's in/out totals", () => {
    const series = buildSeries();
    const todayRule = buildRule({ day_of_month: 10, type: "income", amount: "50.00" }); // series[0].date === "2026-09-10"
    const buckets = groupIntoWeeks(series, [todayRule]);
    expect(buckets[0].inBani).toBe(5000);
    expect(buckets[0].outBani).toBe(0);
  });

  it("scopes in/out totals to each bucket's own date range across multiple rules, without leaking between buckets", () => {
    const series = buildSeries();
    // 2026-09-20 falls in bucket 1 (09-17..09-23).
    const expenseRule = buildRule({ id: 1, day_of_month: 20, type: "expense", amount: "30.00" });
    // day_of_month 5's September occurrence (09-05) is before the
    // window's calculation date (09-10) so it's excluded; its October
    // occurrence (10-05) falls in bucket 3 (10-01..10-07).
    const incomeRule = buildRule({ id: 2, day_of_month: 5, type: "income", amount: "40.00" });
    const buckets = groupIntoWeeks(series, [expenseRule, incomeRule]);

    expect(buckets[0].inBani).toBe(0);
    expect(buckets[0].outBani).toBe(0);

    expect(buckets[1].inBani).toBe(0);
    expect(buckets[1].outBani).toBe(-3000);

    expect(buckets[2].inBani).toBe(0);
    expect(buckets[2].outBani).toBe(0);

    expect(buckets[3].inBani).toBe(4000);
    expect(buckets[3].outBani).toBe(0);

    expect(buckets[4].inBani).toBe(0);
    expect(buckets[4].outBani).toBe(0);
  });

  it("gives empty trailing buckets null dates and balances when the series is shorter than 5 buckets' worth", () => {
    const buckets = groupIntoWeeks([{ date: "2026-09-10", bani: 500 }], []);
    expect(buckets[0]).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      inBani: 0,
      outBani: 0,
      endBalanceBani: 500,
    });
    expect(buckets[4]).toEqual({
      startDate: null,
      endDate: null,
      inBani: 0,
      outBani: 0,
      endBalanceBani: null,
    });
  });
});

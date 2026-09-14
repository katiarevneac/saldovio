import { describe, expect, it } from "vitest";
import { toBaniPoints, findMinimum, groupIntoWeeks } from "./forecast-chart-data";

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
    expect(groupIntoWeeks(buildSeries())).toHaveLength(5);
    expect(groupIntoWeeks([])).toHaveLength(5);
    expect(groupIntoWeeks([{ date: "2026-09-10", bani: 100 }])).toHaveLength(5);
  });

  it("chunks a 31-point series into buckets of 7 days, last bucket smaller", () => {
    const series = buildSeries();
    const buckets = groupIntoWeeks(series);
    expect(buckets[0].startDate).toBe(series[0].date);
    expect(buckets[0].endDate).toBe(series[6].date);
    expect(buckets[3].startDate).toBe(series[21].date);
    expect(buckets[4].startDate).toBe(series[28].date);
    expect(buckets[4].endDate).toBe(series[30].date);
  });

  it("sums positive day-over-day deltas as inBani and negative as outBani, skipping day 0's unanchored delta", () => {
    const buckets = groupIntoWeeks(buildSeries());
    // Bucket 0 covers days 0-6: day 0 contributes nothing (no prior
    // anchor), days 1-6 each add +10 bani = 60 total in, 0 out.
    expect(buckets[0].inBani).toBe(60);
    expect(buckets[0].outBani).toBe(0);
    expect(buckets[0].endBalanceBani).toBe(100000 + 6 * 10);
  });

  it("computes outBani from negative deltas", () => {
    const points = [
      { date: "2026-09-10", bani: 1000 },
      { date: "2026-09-11", bani: 700 }, // -300
      { date: "2026-09-12", bani: 900 }, // +200
    ];
    const buckets = groupIntoWeeks(points);
    expect(buckets[0].inBani).toBe(200);
    expect(buckets[0].outBani).toBe(-300);
  });

  it("gives empty trailing buckets null dates and balances when the series is shorter than 5 buckets' worth", () => {
    const buckets = groupIntoWeeks([{ date: "2026-09-10", bani: 500 }]);
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

import { describe, expect, it } from "vitest";
import { occurrencesInWindow } from "./forecast-occurrences";
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

describe("occurrencesInWindow", () => {
  it("finds a single occurrence within a one-month window", () => {
    const rule = buildRule({ day_of_month: 15 });
    const result = occurrencesInWindow([rule], "2026-09-01", "2026-09-30");
    expect(result).toEqual([{ date: "2026-09-15", rule }]);
  });

  it("clamps day_of_month 31 to a 30-day month's last real day", () => {
    const rule = buildRule({ day_of_month: 31 });
    const result = occurrencesInWindow([rule], "2026-04-01", "2026-05-01");
    expect(result).toEqual([{ date: "2026-04-30", rule }]);
  });

  it("finds two occurrences of a monthly rule in one window near a month boundary", () => {
    // Same edge case as analytics-service/forecast.py's pytest suite:
    // Jan 31 + 30 days = Mar 2, so both Feb 1 and Mar 1 fall inside.
    const rule = buildRule({ day_of_month: 1 });
    const result = occurrencesInWindow([rule], "2026-01-31", "2026-03-02");
    expect(result).toEqual([
      { date: "2026-02-01", rule },
      { date: "2026-03-01", rule },
    ]);
  });

  it("excludes an occurrence landing exactly on the exclusive window end", () => {
    const rule = buildRule({ day_of_month: 30 });
    const result = occurrencesInWindow([rule], "2026-09-01", "2026-09-30");
    expect(result).toEqual([]);
  });

  it("includes an occurrence landing exactly on the inclusive window start", () => {
    const rule = buildRule({ day_of_month: 1 });
    const result = occurrencesInWindow([rule], "2026-09-01", "2026-09-30");
    expect(result).toEqual([{ date: "2026-09-01", rule }]);
  });

  it("does not filter on the active flag (matches the backend's current request payload, which never sends it)", () => {
    const rule = buildRule({ day_of_month: 15, active: false });
    const result = occurrencesInWindow([rule], "2026-09-01", "2026-09-30");
    expect(result).toEqual([{ date: "2026-09-15", rule }]);
  });

  it("returns occurrences from multiple rules sorted by date", () => {
    const ruleA = buildRule({ id: 1, day_of_month: 20 });
    const ruleB = buildRule({ id: 2, day_of_month: 5 });
    const result = occurrencesInWindow([ruleA, ruleB], "2026-09-01", "2026-09-30");
    expect(result.map((occurrence) => occurrence.date)).toEqual(["2026-09-05", "2026-09-20"]);
  });

  it("returns an empty array for an empty rule list", () => {
    expect(occurrencesInWindow([], "2026-09-01", "2026-09-30")).toEqual([]);
  });
});

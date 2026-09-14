import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ForecastChartWeeks from "./ForecastChartWeeks";
import type { RecurringRule } from "@/lib/recurring-rules";

function buildDailyBalances(): { date: string; balance: string }[] {
  const dates = [
    ...Array.from({ length: 21 }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`),
    ...Array.from({ length: 10 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`),
  ];
  return dates.map((date, day) => ({ date, balance: (1000 + day * 10).toFixed(2) }));
}

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

describe("ForecastChartWeeks", () => {
  it("renders exactly 5 week buckets", () => {
    render(<ForecastChartWeeks dailyBalances={buildDailyBalances()} recurringRules={[]} />);
    expect(screen.getAllByTestId("forecast-week-bucket")).toHaveLength(5);
  });

  it("shows each bucket's date range and end-of-week balance", () => {
    render(<ForecastChartWeeks dailyBalances={buildDailyBalances()} recurringRules={[]} />);
    const buckets = screen.getAllByTestId("forecast-week-bucket");
    expect(buckets[0]).toHaveTextContent("10.09");
    expect(buckets[0]).toHaveTextContent("16.09");
  });

  it("renders an empty-state note for a trailing empty bucket instead of blank space", () => {
    render(
      <ForecastChartWeeks
        dailyBalances={[{ date: "2026-09-10", balance: "500.00" }]}
        recurringRules={[]}
      />
    );
    const buckets = screen.getAllByTestId("forecast-week-bucket");
    expect(buckets[4]).toHaveTextContent("—");
  });

  // Regression test for the day-0 blind spot: a rule landing on the
  // series' first date (today) must show up in bucket 0's bars, even
  // though day 0 has no prior balance point to diff against.
  it("renders a non-zero in bar when a rule lands in bucket 0's date range", () => {
    const dailyBalances = buildDailyBalances();
    const todayRule = buildRule({ day_of_month: 10, type: "income", amount: "50.00" }); // dailyBalances[0].date === "2026-09-10"
    render(<ForecastChartWeeks dailyBalances={dailyBalances} recurringRules={[todayRule]} />);
    const buckets = screen.getAllByTestId("forecast-week-bucket");
    const barIn = within(buckets[0]).getByTestId("forecast-week-bar-in");
    expect(barIn.style.height).not.toBe("0%");
  });
});

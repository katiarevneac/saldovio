import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastChart from "./ForecastChart";
import type { RecurringRule } from "@/lib/recurring-rules";

const dailyBalances = [
  { date: "2026-09-10", balance: "1000.00" },
  { date: "2026-09-11", balance: "950.00" },
];

const recurringRules: RecurringRule[] = [];

describe("ForecastChart", () => {
  it("renders Line mode by default point markers when mode is 'line'", () => {
    render(<ForecastChart mode="line" dailyBalances={dailyBalances} recurringRules={recurringRules} />);
    expect(screen.getAllByTestId(/^forecast-point-/)).toHaveLength(2);
  });

  it("renders Weeks mode's 5 buckets when mode is 'weeks'", () => {
    render(<ForecastChart mode="weeks" dailyBalances={dailyBalances} recurringRules={recurringRules} />);
    expect(screen.getAllByTestId("forecast-week-bucket")).toHaveLength(5);
  });

  it("renders Calendar mode's day cells when mode is 'calendar'", () => {
    render(<ForecastChart mode="calendar" dailyBalances={dailyBalances} recurringRules={recurringRules} />);
    expect(screen.getAllByTestId(/^forecast-day-cell-/)).toHaveLength(2);
  });

  it("passes afterSeries through to Line mode only", () => {
    const afterSeries = dailyBalances.map((entry) => ({ ...entry, balance: String(Number(entry.balance) - 50) }));
    render(
      <ForecastChart
        mode="line"
        dailyBalances={dailyBalances}
        recurringRules={recurringRules}
        afterSeries={afterSeries}
      />
    );
    expect(screen.getAllByTestId(/^forecast-point-after-/)).toHaveLength(2);
  });
});

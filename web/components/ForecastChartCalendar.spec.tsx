import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastChartCalendar from "./ForecastChartCalendar";
import type { RecurringRule } from "@/lib/recurring-rules";

const dailyBalances = [
  { date: "2026-09-10", balance: "1000.00" },
  { date: "2026-09-11", balance: "700.00" },
  { date: "2026-09-12", balance: "900.00" },
];

function buildRule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    type: "expense",
    amount: "300.00",
    frequency: "monthly",
    day_of_month: 11,
    category: "Rent",
    active: true,
    ...overrides,
  };
}

describe("ForecastChartCalendar", () => {
  it("renders one cell per day in dailyBalances", () => {
    render(<ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={[]} />);
    expect(screen.getAllByTestId(/^forecast-day-cell-/)).toHaveLength(3);
  });

  it("marks the minimum-balance day", () => {
    render(<ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={[]} />);
    expect(screen.getByTestId("forecast-day-cell-2026-09-11")).toHaveAttribute("data-minimum", "true");
    expect(screen.getByTestId("forecast-day-cell-2026-09-10")).toHaveAttribute("data-minimum", "false");
  });

  it("renders a rule-day card for each occurrence within the window", () => {
    const rule = buildRule({ day_of_month: 11 });
    render(<ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={[rule]} />);
    const cards = screen.getAllByTestId("forecast-rule-day");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Rent");
    expect(cards[0]).toHaveTextContent("11.09");
  });

  it("renders no rule-day cards when no rule occurs in the window", () => {
    const rule = buildRule({ day_of_month: 25 });
    render(<ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={[rule]} />);
    expect(screen.queryAllByTestId("forecast-rule-day")).toHaveLength(0);
  });
});

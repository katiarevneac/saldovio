import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastChartWeeks from "./ForecastChartWeeks";

function buildDailyBalances(): { date: string; balance: string }[] {
  const dates = [
    ...Array.from({ length: 21 }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`),
    ...Array.from({ length: 10 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`),
  ];
  return dates.map((date, day) => ({ date, balance: (1000 + day * 10).toFixed(2) }));
}

describe("ForecastChartWeeks", () => {
  it("renders exactly 5 week buckets", () => {
    render(<ForecastChartWeeks dailyBalances={buildDailyBalances()} />);
    expect(screen.getAllByTestId("forecast-week-bucket")).toHaveLength(5);
  });

  it("shows each bucket's date range and end-of-week balance", () => {
    render(<ForecastChartWeeks dailyBalances={buildDailyBalances()} />);
    const buckets = screen.getAllByTestId("forecast-week-bucket");
    expect(buckets[0]).toHaveTextContent("10.09");
    expect(buckets[0]).toHaveTextContent("16.09");
  });

  it("renders an empty-state note for a trailing empty bucket instead of blank space", () => {
    render(<ForecastChartWeeks dailyBalances={[{ date: "2026-09-10", balance: "500.00" }]} />);
    const buckets = screen.getAllByTestId("forecast-week-bucket");
    expect(buckets[4]).toHaveTextContent("—");
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastChartLine from "./ForecastChartLine";

const dailyBalances = [
  { date: "2026-09-10", balance: "1000.00" },
  { date: "2026-09-11", balance: "950.00" },
  { date: "2026-09-12", balance: "900.00" },
  { date: "2026-09-13", balance: "1200.00" },
];

describe("ForecastChartLine", () => {
  it("renders one point per day in dailyBalances", () => {
    render(<ForecastChartLine dailyBalances={dailyBalances} />);
    expect(screen.getAllByTestId(/^forecast-point-/)).toHaveLength(4);
  });

  it("renders a Today reference line at the first point and a Low reference line at the minimum", () => {
    render(<ForecastChartLine dailyBalances={dailyBalances} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders an after-purchase overlay series when afterSeries is provided", () => {
    const afterSeries = dailyBalances.map((entry) => ({
      ...entry,
      balance: String(Number(entry.balance) - 100),
    }));
    render(<ForecastChartLine dailyBalances={dailyBalances} afterSeries={afterSeries} />);
    // Excludes "forecast-point-after-*" testids, which also match a bare
    // /^forecast-point-/ prefix — without the negative lookahead this
    // assertion double-counts against the second assertion below.
    expect(screen.getAllByTestId(/^forecast-point-(?!after-)/)).toHaveLength(4);
    expect(screen.getAllByTestId(/^forecast-point-after-/)).toHaveLength(4);
  });

  it("renders nothing extra when afterSeries is omitted", () => {
    render(<ForecastChartLine dailyBalances={dailyBalances} />);
    expect(screen.queryAllByTestId(/^forecast-point-after-/)).toHaveLength(0);
  });

  it("renders plain HTML tick labels, not SVG text, for the x-axis", () => {
    render(<ForecastChartLine dailyBalances={dailyBalances} />);
    // The custom tick renders each date's day.month label as a <span>
    // inside a <foreignObject> — a real DOM text node RTL can query,
    // matching the design's "not SVG text" requirement. XAxis uses
    // Recharts' default interval="preserveEnd", which auto-skips ticks
    // based on measured label width; in jsdom (no real text metrics)
    // that keeps only the last tick, so this asserts on the last date
    // rather than the first.
    expect(screen.getByTestId("forecast-tick-2026-09-13")).toBeInTheDocument();
  });
});

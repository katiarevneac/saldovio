import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ForecastSection from "./ForecastSection";
import type { Forecast } from "@/lib/analytics";

function buildForecast(overrides: Partial<Forecast> = {}): Forecast {
  return {
    forecastBalance: "1200.00",
    calculationDate: "2026-09-14",
    windowEndDate: "2026-10-14",
    formulaVersion: "1",
    assumptions: ["Only confirmed recurring rules are included."],
    dailyBalances: [
      { date: "2026-09-14", balance: "1000.00" },
      { date: "2026-09-15", balance: "1050.00" },
    ],
    ...overrides,
  };
}

describe("ForecastSection", () => {
  it("shows the unavailable message when forecast is null", () => {
    render(<ForecastSection forecast={null} recurringRules={[]} />);

    expect(
      screen.getByText(/Forecast unavailable right now/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Forecast view" })).not.toBeInTheDocument();
  });

  it("shows the unavailable message when dailyBalances is empty", () => {
    render(
      <ForecastSection forecast={buildForecast({ dailyBalances: [] })} recurringRules={[]} />
    );

    expect(
      screen.getByText(/Forecast unavailable right now/)
    ).toBeInTheDocument();
  });

  it("renders a mode switcher with Line pressed by default, and switches modes on click", async () => {
    render(<ForecastSection forecast={buildForecast()} recurringRules={[]} />);

    const lineButton = await screen.findByRole("button", { name: "Line" });
    const weeksButton = screen.getByRole("button", { name: "Weeks" });
    const calendarButton = screen.getByRole("button", { name: "Calendar" });

    expect(lineButton).toHaveAttribute("aria-pressed", "true");
    expect(weeksButton).toHaveAttribute("aria-pressed", "false");
    expect(calendarButton).toHaveAttribute("aria-pressed", "false");

    weeksButton.click();

    // `weeksButton.click()` fires synchronously, but ForecastSection's
    // mode state lives alongside a next/dynamic-loaded child (ForecastChart).
    // Even after that child has already resolved (awaited above via
    // findByRole), React defers the resulting re-render by a tick in this
    // environment, so the aria-pressed flip isn't observable until the next
    // microtask — hence waitFor rather than a synchronous getBy/expect.
    await waitFor(() => {
      expect(weeksButton).toHaveAttribute("aria-pressed", "true");
      expect(lineButton).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("renders the assumptions/calculation-date/formula-version footer", async () => {
    render(<ForecastSection forecast={buildForecast()} recurringRules={[]} />);

    await screen.findByRole("group", { name: "Forecast view" });

    expect(
      screen.getByText("Only confirmed recurring rules are included.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/As of 2026-09-14, through 2026-10-14 \(formula v1\)/)
    ).toBeInTheDocument();
  });
});

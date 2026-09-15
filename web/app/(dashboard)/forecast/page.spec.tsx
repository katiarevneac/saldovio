import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { getMyAccountsMock } = vi.hoisted(() => ({ getMyAccountsMock: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ getMyAccounts: getMyAccountsMock }));

const { getMyRecurringRulesMock } = vi.hoisted(() => ({
  getMyRecurringRulesMock: vi.fn(),
}));
vi.mock("@/lib/recurring-rules", () => ({
  getMyRecurringRules: getMyRecurringRulesMock,
}));

const { getForecastMock } = vi.hoisted(() => ({ getForecastMock: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ getForecast: getForecastMock }));

const { getMySettingsMock } = vi.hoisted(() => ({ getMySettingsMock: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getMySettings: getMySettingsMock }));

import ForecastPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();
  getForecastMock.mockReset();
  getMySettingsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getMyAccountsMock.mockResolvedValue([
    { id: 1, name: "Cont curent", current_balance: "0.00", reference_date: "2026-01-01", balance: "1000.00" },
  ]);
  getMyRecurringRulesMock.mockResolvedValue([]);
  getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: null, horizon_days: 30 });
});

describe("ForecastPage", () => {
  it("redirects to /login and skips the fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(ForecastPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
    expect(getForecastMock).not.toHaveBeenCalled();
  });

  it("renders 3 KPI cards and the chart+switcher on success", async () => {
    getForecastMock.mockResolvedValue({
      forecastBalance: "1200.00",
      calculationDate: "2026-09-14",
      windowEndDate: "2026-10-14",
      formulaVersion: "1",
      assumptions: ["Only confirmed recurring rules are included."],
      dailyBalances: [
        { date: "2026-09-14", balance: "1000.00" },
        { date: "2026-09-20", balance: "900.00" },
        { date: "2026-10-14", balance: "1200.00" },
      ],
    });

    const ui = await ForecastPage();
    render(ui);

    expect(screen.getByRole("heading", { name: "Forecast" })).toBeInTheDocument();
    expect(screen.getByText("Current balance")).toBeInTheDocument();
    expect(screen.getByText("Balance in 30 days")).toBeInTheDocument();
    expect(screen.getByText("Lowest projected")).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Forecast view" })).toBeInTheDocument();
  });

  it("shows the account-derived total balance as 'Current balance', not dailyBalances[0] (which may already include a same-day rule occurrence)", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Cont curent", current_balance: "0.00", reference_date: "2026-01-01", balance: "1000.00" },
    ]);
    getForecastMock.mockResolvedValue({
      forecastBalance: "1200.00",
      calculationDate: "2026-09-14",
      windowEndDate: "2026-10-14",
      formulaVersion: "1",
      assumptions: ["Only confirmed recurring rules are included."],
      dailyBalances: [
        { date: "2026-09-14", balance: "1100.00" },
        { date: "2026-10-14", balance: "1200.00" },
      ],
    });

    const ui = await ForecastPage();
    render(ui);

    // Scope to the "Current balance" card itself — "1.100,00" legitimately
    // appears elsewhere on the page (it's the "Lowest projected" value here),
    // so the assertion needs to be about which number this specific card
    // shows, not about "1.100,00" being absent from the page entirely.
    const currentBalanceCard = screen.getByText("Current balance")
      .parentElement!.parentElement!;
    expect(within(currentBalanceCard).getByText("1.000,00")).toBeInTheDocument();
    expect(
      within(currentBalanceCard).queryByText("1.100,00")
    ).not.toBeInTheDocument();
  });

  it("shows the unavailable message and no KPI cards when the fetch fails", async () => {
    getForecastMock.mockRejectedValue(new Error("network error"));

    const ui = await ForecastPage();
    render(ui);

    expect(screen.getByText(/Forecast unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText("Current balance")).not.toBeInTheDocument();
  });
});

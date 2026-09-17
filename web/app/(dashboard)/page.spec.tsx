import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: authMock,
}));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
// TransactionForm (rendered inside DashboardPage's JSX) calls useRouter()
// from this same module — needs a mock too, or rendering the page crashes.
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

const { getMyAccountsMock } = vi.hoisted(() => ({
  getMyAccountsMock: vi.fn(),
}));
vi.mock("@/lib/accounts", () => ({
  getMyAccounts: getMyAccountsMock,
}));

const { getMyRecurringRulesMock } = vi.hoisted(() => ({
  getMyRecurringRulesMock: vi.fn(),
}));
vi.mock("@/lib/recurring-rules", () => ({
  getMyRecurringRules: getMyRecurringRulesMock,
}));

const { getTransactionsMock } = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
}));
vi.mock("@/lib/transactions", () => ({
  getTransactions: getTransactionsMock,
}));

const { getForecastMock } = vi.hoisted(() => ({
  getForecastMock: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  getForecast: getForecastMock,
}));

const { getMySettingsMock } = vi.hoisted(() => ({
  getMySettingsMock: vi.fn(),
}));
vi.mock("@/lib/settings", () => ({
  getMySettings: getMySettingsMock,
}));

const { simulatePurchaseSpy } = vi.hoisted(() => ({ simulatePurchaseSpy: vi.fn() }));
vi.mock("@/lib/simulator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/simulator")>();
  return {
    ...actual,
    simulatePurchase: (...args: Parameters<typeof actual.simulatePurchase>) => {
      simulatePurchaseSpy(...args);
      return actual.simulatePurchase(...args);
    },
  };
});

// TransactionForm (rendered inside DashboardPage's JSX) statically imports
// "@/app/actions", which imports "@/lib/internal-auth" (`import
// "server-only"`). Mocking the action module keeps that real server-only
// code out of the test's module graph — same pattern as before this story.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
  createAccountAction: vi.fn(),
  createRecurringRuleAction: vi.fn(),
}));

import DashboardPage from "./page";
import { computeWindowEnd } from "@/lib/forecast-window";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();
  getTransactionsMock.mockReset();
  getForecastMock.mockReset();
  getMySettingsMock.mockReset();

  authMock.mockResolvedValue({
    user: { id: "1", email: "test@example.com" },
  });
  getMyRecurringRulesMock.mockResolvedValue([]);
  getForecastMock.mockResolvedValue({
    forecastBalance: "0.00",
    calculationDate: "2026-09-10",
    windowEndDate: "2026-10-10",
    formulaVersion: "1",
    assumptions: [],
    dailyBalances: [{ date: "2026-09-10", balance: "0.00" }],
  });
  getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: null, horizon_days: 30 });
});

describe("DashboardPage", () => {
  it("redirects to /login and skips data fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).not.toHaveBeenCalled();
  });

  it("renders KPI cards computed from accounts and this month's transactions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([
        {
          id: 1,
          name: "Cont curent",
          current_balance: "0.00",
          reference_date: "2026-01-01",
          balance: "1000.00",
        },
      ]);
      getTransactionsMock.mockResolvedValue([
        { id: 1, account_id: 1, type: "income", amount: "500.00", occurred_on: "2026-09-05", category: "Salary" },
        { id: 2, account_id: 1, type: "expense", amount: "-200.00", occurred_on: "2026-09-06", category: "Groceries" },
        { id: 3, account_id: 1, type: "income", amount: "999.00", occurred_on: "2026-01-01", category: "Old" },
      ]);

      const ui = await DashboardPage();
      render(ui);

      expect(screen.getByText("Total balance")).toBeInTheDocument();
      expect(screen.getByText("Income this month")).toBeInTheDocument();
      expect(screen.getByText("500,00")).toBeInTheDocument();
      expect(screen.getByText("Expenses this month")).toBeInTheDocument();
      expect(screen.getByText("200,00")).toBeInTheDocument();
      expect(screen.getByText("Monthly surplus")).toBeInTheDocument();
      expect(screen.getByText("300,00")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows up to 3 condensed accounts with a link to the full list", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "A1", current_balance: "0.00", reference_date: "2026-01-01", balance: "10.00" },
      { id: 2, name: "A2", current_balance: "0.00", reference_date: "2026-01-01", balance: "20.00" },
      { id: 3, name: "A3", current_balance: "0.00", reference_date: "2026-01-01", balance: "30.00" },
      { id: 4, name: "A4", current_balance: "0.00", reference_date: "2026-01-01", balance: "40.00" },
    ]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    // Account names also appear as <option> text in TransactionForm's
    // account <select> (which receives the full accounts list, not the
    // condensed slice) — scope these assertions to the Accounts card so
    // they only match the condensed list, not the form's select options.
    const accountsSection = screen
      .getByRole("heading", { name: "Accounts" })
      .closest("section")!;

    expect(within(accountsSection).getByText("A1")).toBeInTheDocument();
    expect(within(accountsSection).getByText("A3")).toBeInTheDocument();
    expect(within(accountsSection).queryByText("A4")).not.toBeInTheDocument();
    expect(
      within(accountsSection).getByRole("link", { name: "View all accounts" })
    ).toHaveAttribute("href", "/accounts");
  });

  it("shows up to 5 condensed recent transactions with a link to the full list", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        account_id: 1,
        type: "expense" as const,
        amount: "-10.00",
        occurred_on: `2026-09-0${i + 1}`,
        category: `Tx${i + 1}`,
      }))
    );

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Tx6$/)).toBeInTheDocument();
    expect(screen.queryByText(/Tx1$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all transactions" })
    ).toHaveAttribute("href", "/transactions");
  });

  it("renders the simulator card with a default amount and verdict", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByRole("heading", { name: "Simulator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Purchase amount")).toHaveValue(100);
  });

  it("shows a forecast-unavailable message without crashing when Analytics Service fails", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getForecastMock.mockRejectedValue(new Error("network error"));

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Forecast unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText("0,00 RON")).not.toBeInTheDocument();
  });

  it("shows a forecast-unavailable message when dailyBalances is empty even though the fetch succeeded", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getForecastMock.mockResolvedValue({
      forecastBalance: "0.00",
      calculationDate: "2026-09-10",
      windowEndDate: "2026-10-10",
      formulaVersion: "1",
      assumptions: [],
      dailyBalances: [],
    });

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Forecast unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText("0,00 RON")).not.toBeInTheDocument();
  });

  it("shows the 30-day projected balance headline when the forecast has data", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getForecastMock.mockResolvedValue({
      forecastBalance: "1234.56",
      calculationDate: "2026-09-10",
      windowEndDate: "2026-10-10",
      formulaVersion: "1",
      assumptions: [],
      dailyBalances: [{ date: "2026-09-10", balance: "1234.56" }],
    });

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("1.234,56 RON")).toBeInTheDocument();
  });

  it("computes windowEndDate from settings.payday and settings.horizon_days, in that order, and passes it to getForecast", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([]);
      getTransactionsMock.mockResolvedValue([]);
      getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: 20, horizon_days: 45 });

      await DashboardPage();

      const expectedWindowEnd = computeWindowEnd("2026-09-15", 20, 45);
      expect(getForecastMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expectedWindowEnd
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the same windowEndDate it computed for the forecast into the simulator card", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([]);
      getTransactionsMock.mockResolvedValue([]);
      getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: 20, horizon_days: 45 });

      const ui = await DashboardPage();
      render(ui);

      const expectedWindowEnd = computeWindowEnd("2026-09-15", 20, 45);
      expect(simulatePurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ windowEndDate: expectedWindowEnd, essentialSpendBani: null })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("converts settings.essential_spend to bani and passes it into the simulator card", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getMySettingsMock.mockResolvedValue({
      essential_spend: "500.00",
      payday: null,
      horizon_days: 30,
    });

    const ui = await DashboardPage();
    render(ui);

    expect(simulatePurchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ essentialSpendBani: 50000 })
    );
  });

  it("passes a null essentialSpendBani when the user has not set an essential spend", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(simulatePurchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ essentialSpendBani: null })
    );
  });

  it("keeps the settings-derived window for the simulator card when only getForecast fails", async () => {
    // The simulator's window depends on settings alone. A forecast-only
    // outage must not silently reset it to the legacy 30-day default.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([]);
      getTransactionsMock.mockResolvedValue([]);
      getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: 20, horizon_days: 45 });
      getForecastMock.mockRejectedValue(new Error("analytics down"));

      const ui = await DashboardPage();
      render(ui);

      const expectedWindowEnd = computeWindowEnd("2026-09-15", 20, 45);
      expect(expectedWindowEnd).not.toBe("2026-10-15");
      expect(simulatePurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ windowEndDate: expectedWindowEnd, essentialSpendBani: null })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the legacy 30-day window for the simulator card when settings are unreachable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([]);
      getTransactionsMock.mockResolvedValue([]);
      getMySettingsMock.mockRejectedValue(new Error("network error"));

      const ui = await DashboardPage();
      render(ui);

      expect(simulatePurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ windowEndDate: "2026-10-15", essentialSpendBani: null })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the add-transaction trigger, with the modal closed by default", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(
      screen.getByRole("button", { name: "+ Add transaction" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Add transaction" })
    ).not.toBeInTheDocument();
  });
});

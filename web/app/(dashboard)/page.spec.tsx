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

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();
  getTransactionsMock.mockReset();
  getForecastMock.mockReset();

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
  });
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

  it("renders the simulator placeholder card", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Simulator")).toBeInTheDocument();
    expect(screen.getByText(/coming in a later story/)).toBeInTheDocument();
  });

  it("shows a forecast-unavailable message without crashing when Analytics Service fails", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getForecastMock.mockRejectedValue(new Error("network error"));

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Forecast unavailable right now/)).toBeInTheDocument();
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

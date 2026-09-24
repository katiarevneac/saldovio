import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const { getMyAccountsMock } = vi.hoisted(() => ({
  getMyAccountsMock: vi.fn(),
}));
vi.mock("@/lib/accounts", () => ({
  getMyAccounts: getMyAccountsMock,
}));

vi.mock("@/app/actions", () => ({
  updateAccountFlagsAction: vi.fn(),
}));

import AccountsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
});

describe("AccountsPage", () => {
  it("redirects to /login and skips the fetch when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(AccountsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
  });

  it("renders the total balance and each account's balance, reference date, and share of total", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, balance: "7500.00" },
      { id: 2, name: "Cash", current_balance: "0.00", reference_date: "2026-03-01", opening_boundary: "start_of_day" as const, configured: true, balance: "2500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByText("2 accounts")).toBeInTheDocument();
    expect(screen.getAllByText(/^RON$/).length).toBeGreaterThan(0);
    expect(screen.getByText("10.000,00")).toBeInTheDocument(); // total balance amount
    expect(screen.getByText("Revolut")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Reference date: 2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("75.0% of total")).toBeInTheDocument();
    expect(screen.getByText("25.0% of total")).toBeInTheDocument();
  });

  it("shows an explicit unavailable percentage instead of a fabricated value when accounts net to zero", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, balance: "500.00" },
      { id: 2, name: "Loan", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, balance: "-500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getAllByText("% of total: unavailable").length).toBe(2);
  });

  it("shows a Complete setup link for an unconfigured account, and none for a configured one", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Cont curent", current_balance: "0.00", reference_date: "2026-09-20", opening_boundary: "start_of_day" as const, configured: false, balance: "0.00" },
      { id: 2, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, balance: "500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    const links = screen.getAllByRole("link", { name: "Complete setup" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/accounts/1/edit");
  });

  it("shows an empty state and no cards when the user has no accounts", async () => {
    getMyAccountsMock.mockResolvedValue([]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByText("No accounts yet.")).toBeInTheDocument();
    expect(screen.getByText("0 accounts")).toBeInTheDocument();
  });

  // S03.6: archived accounts move to their own section, but their balance
  // stays in the total — "must not silently erase money/history from
  // consolidated reporting."
  it("counts an archived account's balance in the total but renders it only in the Archived section", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "500.00" },
      { id: 2, name: "Old account", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: true, protectedSavings: false, balance: "300.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByText("800,00")).toBeInTheDocument(); // total balance: 500 + 300

    const mainGrid = screen.getByTestId("accounts-grid");
    expect(within(mainGrid).queryByText("Old account")).not.toBeInTheDocument();

    const archivedSection = screen.getByTestId("archived-accounts");
    expect(within(archivedSection).getByText("Old account")).toBeInTheDocument();
    expect(within(archivedSection).getByRole("button", { name: "Unarchive" })).toBeInTheDocument();
  });

  it("shows an Archive button on a non-archived account and no Archived section when none are archived", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByTestId("archived-accounts")).not.toBeInTheDocument();
  });

  it("shows a protected-savings badge and an Unmark action on a protected-savings account", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Emergency fund", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: true, balance: "1000.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByText("Protected savings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unmark protected savings" })).toBeInTheDocument();
  });

  it("shows a Mark protected savings action on a non-protected account", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.queryByText("Protected savings")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark protected savings" })).toBeInTheDocument();
  });
});

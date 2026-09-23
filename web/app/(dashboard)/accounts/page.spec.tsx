import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, balance: "7500.00" },
      { id: 2, name: "Cash", current_balance: "0.00", reference_date: "2026-03-01", opening_boundary: "start_of_day" as const, balance: "2500.00" },
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
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, balance: "500.00" },
      { id: 2, name: "Loan", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, balance: "-500.00" },
    ]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getAllByText("% of total: unavailable").length).toBe(2);
  });

  it("shows an empty state and no cards when the user has no accounts", async () => {
    getMyAccountsMock.mockResolvedValue([]);

    const ui = await AccountsPage();
    render(ui);

    expect(screen.getByText("No accounts yet.")).toBeInTheDocument();
    expect(screen.getByText("0 accounts")).toBeInTheDocument();
  });
});

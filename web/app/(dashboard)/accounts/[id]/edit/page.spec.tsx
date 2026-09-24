import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

const { getTransactionsMock } = vi.hoisted(() => ({ getTransactionsMock: vi.fn() }));
vi.mock("@/lib/transactions", () => ({ getTransactions: getTransactionsMock }));

vi.mock("@/app/actions", () => ({ updateAccountAction: vi.fn(() => () => {}) }));

import EditAccountPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getTransactionsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getTransactionsMock.mockResolvedValue([]);
});

describe("EditAccountPage", () => {
  it("redirects to /login when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      EditAccountPage({ params: Promise.resolve({ id: "1" }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("shows 'Complete account setup' for an unconfigured account", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Cont curent", current_balance: "0.00", reference_date: "2026-09-20", opening_boundary: "start_of_day" as const, configured: false, archived: false, protectedSavings: false, balance: "0.00" },
    ]);

    const ui = await EditAccountPage({
      params: Promise.resolve({ id: "1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByRole("heading", { name: "Complete account setup" })).toBeInTheDocument();
  });

  // S03.7: a configured account is now reachable here too — this used to
  // be an unconditional redirect back to /accounts.
  it("shows 'Correct account balance' and stays on the page for an already-configured account", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Cont curent", current_balance: "100.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "100.00" },
    ]);

    const ui = await EditAccountPage({
      params: Promise.resolve({ id: "1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Correct account balance" })).toBeInTheDocument();
  });

  it("passes only this account's transactions into the correction form's preview", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Cont curent", current_balance: "100.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "100.00" },
    ]);
    getTransactionsMock.mockResolvedValue([
      { id: 1, account_id: 1, type: "income", amount: "20.00", occurred_on: "2026-02-01", category: null },
      { id: 2, account_id: 2, type: "income", amount: "999.00", occurred_on: "2026-02-01", category: null },
    ]);

    const ui = await EditAccountPage({
      params: Promise.resolve({ id: "1" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // 100 (starting) + 20 (this account's own transaction) — the other
    // account's 999 must not leak into this account's preview.
    expect(screen.getByTestId("balance-preview")).toHaveTextContent("120,00");
  });
});

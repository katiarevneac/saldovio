// web/app/(dashboard)/transactions/page.spec.tsx
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
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

const { getTransactionsMock } = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
}));
vi.mock("@/lib/transactions", () => ({
  getTransactions: getTransactionsMock,
}));

const { getMyAccountsMock } = vi.hoisted(() => ({
  getMyAccountsMock: vi.fn(),
}));
vi.mock("@/lib/accounts", () => ({
  getMyAccounts: getMyAccountsMock,
}));

// AddTransactionModal -> TransactionForm statically imports "@/app/actions",
// which imports "@/lib/internal-auth" (`import "server-only"`) — mock it
// out of the module graph, same pattern as page.spec.tsx on Overview.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
}));

import TransactionsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getTransactionsMock.mockReset();
  getMyAccountsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
});

describe("TransactionsPage", () => {
  it("redirects to /login and skips the fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(TransactionsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getTransactionsMock).not.toHaveBeenCalled();
    expect(getMyAccountsMock).not.toHaveBeenCalled();
  });

  it("renders the transaction count in the header and the explorer table", async () => {
    getTransactionsMock.mockResolvedValue([
      { id: 1, account_id: 1, type: "expense", amount: "-150.00", occurred_on: "2026-09-14", category: "Transport" },
      { id: 2, account_id: 1, type: "income", amount: "500.00", occurred_on: "2026-09-01", category: null },
    ]);
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Revolut", current_balance: "0.00", reference_date: "2026-01-01", balance: "100.00" },
    ]);

    const ui = await TransactionsPage();
    render(ui);

    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument();
    // Both fixture transactions share account_id 1, so "Revolut" renders in
    // two table cells — getAllByText avoids the multiple-match error
    // getByText would throw here (same class of collision documented in
    // Story 3's page.spec.tsx fix for the Overview "condensed accounts" test).
    expect(screen.getAllByText("Revolut").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "+ Add transaction" })).toBeInTheDocument();
  });

  it("renders singular transaction count when there is exactly one", async () => {
    getTransactionsMock.mockResolvedValue([
      { id: 1, account_id: 1, type: "expense", amount: "-10.00", occurred_on: "2026-09-14", category: "Transport" },
    ]);
    getMyAccountsMock.mockResolvedValue([]);

    const ui = await TransactionsPage();
    render(ui);

    expect(screen.getByText(/1 transaction ·/)).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { getTransactionsMock } = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
}));
vi.mock("@/lib/transactions", () => ({
  getTransactions: getTransactionsMock,
}));

import TransactionsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getTransactionsMock.mockReset();
});

describe("TransactionsPage", () => {
  it("redirects to /login and skips the fetch when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(TransactionsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getTransactionsMock).not.toHaveBeenCalled();
  });

  it("fetches transactions and does not redirect when a session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    getTransactionsMock.mockResolvedValue([]);

    await TransactionsPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).toHaveBeenCalled();
  });
});

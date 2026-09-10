import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: vi.fn(),
}));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
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

const { getMyRecurringRulesMock } = vi.hoisted(() => ({
  getMyRecurringRulesMock: vi.fn(),
}));
vi.mock("@/lib/recurring-rules", () => ({
  getMyRecurringRules: getMyRecurringRulesMock,
}));

const { getForecastMock } = vi.hoisted(() => ({
  getForecastMock: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  getForecast: getForecastMock,
}));

// TransactionForm (rendered inside DashboardPage's JSX) statically imports
// "@/app/actions", which imports "@/lib/internal-auth" (`import
// "server-only"`). Next.js resolves that package's "react-server" export
// condition to a no-op at build time; plain Vitest has no such condition
// configured and resolves the throwing "default" export instead. Mocking
// the action module — same as every other data-layer import above — keeps
// that real server-only code out of the test's module graph.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
  createAccountAction: vi.fn(),
  createRecurringRuleAction: vi.fn(),
}));

import DashboardPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getTransactionsMock.mockReset();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();
  getForecastMock.mockReset();
});

describe("DashboardPage", () => {
  it("redirects to /login and skips data fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).not.toHaveBeenCalled();
    expect(getMyRecurringRulesMock).not.toHaveBeenCalled();
  });

  it("fetches dashboard data and does not redirect when a session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getMyRecurringRulesMock.mockResolvedValue([]);
    getForecastMock.mockResolvedValue({
      forecastBalance: "0.00",
      calculationDate: "2026-09-10",
      windowEndDate: "2026-10-10",
      formulaVersion: "1",
      assumptions: [],
    });

    await DashboardPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getMyAccountsMock).toHaveBeenCalled();
  });
});

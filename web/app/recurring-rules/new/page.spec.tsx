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

vi.mock("@/app/actions", () => ({
  createRecurringRuleAction: vi.fn(),
}));

import NewRecurringRulePage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
});

describe("NewRecurringRulePage", () => {
  // S03.6: an archived account can't be picked as the target of a new
  // recurring rule.
  it("excludes an archived account from the account picker", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Active", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "100.00" },
      { id: 2, name: "Old account", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: true, protectedSavings: false, balance: "50.00" },
    ]);

    const ui = await NewRecurringRulePage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByRole("option", { name: "Active" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Old account" })).not.toBeInTheDocument();
  });
});

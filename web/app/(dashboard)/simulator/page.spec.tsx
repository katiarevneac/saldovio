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

const { getMyRecurringRulesMock } = vi.hoisted(() => ({
  getMyRecurringRulesMock: vi.fn(),
}));
vi.mock("@/lib/recurring-rules", () => ({
  getMyRecurringRules: getMyRecurringRulesMock,
}));

import SimulatorPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getMyAccountsMock.mockResolvedValue([
    { id: 1, name: "Cont curent", current_balance: "0.00", reference_date: "2026-01-01", balance: "1000.00" },
  ]);
  getMyRecurringRulesMock.mockResolvedValue([]);
});

describe("SimulatorPage", () => {
  it("redirects to /login and skips the fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      SimulatorPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
  });

  it("renders the heading and a default 'Yes' verdict with no amount param", async () => {
    const ui = await SimulatorPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByRole("heading", { name: "Can I afford it?" })).toBeInTheDocument();
    expect(screen.getByText(/this purchase looks affordable/)).toBeInTheDocument();
  });

  it("prefills the amount from the ?amount= query param (bani)", async () => {
    const ui = await SimulatorPage({
      searchParams: Promise.resolve({ amount: "150000" }),
    });
    render(ui);

    expect(screen.getByLabelText("Purchase amount")).toHaveValue(1500);
  });

  it("ignores a malformed ?amount= param and falls back to 0", async () => {
    const ui = await SimulatorPage({
      searchParams: Promise.resolve({ amount: "not-a-number" }),
    });
    render(ui);

    expect(screen.getByLabelText("Purchase amount")).toHaveValue(0);
  });
});

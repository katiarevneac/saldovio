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

const { getMySettingsMock } = vi.hoisted(() => ({ getMySettingsMock: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getMySettings: getMySettingsMock }));

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

import SimulatorPage from "./page";
import { computeWindowEnd } from "@/lib/forecast-window";

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
  getMySettingsMock.mockReset();
  getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: null, horizon_days: 30 });
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

  it("computes windowEndDate from settings the same way as the forecast pages, and passes it into simulatePurchase", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMySettingsMock.mockResolvedValue({ essential_spend: null, payday: 20, horizon_days: 45 });

      const ui = await SimulatorPage({ searchParams: Promise.resolve({}) });
      render(ui);

      const expectedWindowEnd = computeWindowEnd("2026-09-15", 20, 45);
      expect(simulatePurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ windowEndDate: expectedWindowEnd, essentialSpendBani: null })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("converts settings.essential_spend to bani and passes it into simulatePurchase", async () => {
    getMySettingsMock.mockResolvedValue({
      essential_spend: "500.00",
      payday: null,
      horizon_days: 30,
    });

    const ui = await SimulatorPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(simulatePurchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ essentialSpendBani: 50000 })
    );
  });

  it("passes a null essentialSpendBani when the user has not set an essential spend", async () => {
    const ui = await SimulatorPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(simulatePurchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ essentialSpendBani: null })
    );
  });

  it("falls back to the legacy 30-day window when settings are unreachable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMySettingsMock.mockRejectedValue(new Error("network error"));

      const ui = await SimulatorPage({ searchParams: Promise.resolve({}) });
      render(ui);

      expect(simulatePurchaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({ windowEndDate: "2026-10-15", essentialSpendBani: null })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

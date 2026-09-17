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

const { getMySettingsMock } = vi.hoisted(() => ({ getMySettingsMock: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getMySettings: getMySettingsMock }));

// Mocking "@/app/actions" keeps the real Server Action — which imports
// "@/lib/internal-auth" (`import "server-only"`) — out of the test's module
// graph, same pattern already used by "(dashboard)/page.spec.tsx".
vi.mock("@/app/actions", () => ({
  updateSettingsAction: vi.fn(),
}));

import SettingsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMySettingsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getMySettingsMock.mockResolvedValue({
    essential_spend: null,
    payday: null,
    horizon_days: 30,
  });
});

describe("SettingsPage", () => {
  it("redirects to /login and skips the fetch when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(
      SettingsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMySettingsMock).not.toHaveBeenCalled();
  });

  it("shows the signed-in user's email in the Profile card", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("prefills the form inputs from the fetched settings", async () => {
    getMySettingsMock.mockResolvedValue({
      essential_spend: "1500.50",
      payday: 15,
      horizon_days: 45,
    });

    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByLabelText("Essential spend (RON, optional)")
    ).toHaveValue(1500.5);
    expect(
      screen.getByLabelText("Payday (day of month, optional)")
    ).toHaveValue(15);
    expect(screen.getByLabelText("Forecast horizon (days)")).toHaveValue(45);
  });

  it('shows "Settings saved." when searchParams.saved is "1"', async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ saved: "1" }),
    });
    render(ui);

    expect(screen.getByText("Settings saved.")).toBeInTheDocument();
  });

  it("shows the error message from searchParams.error", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ error: "Payday must be between 1 and 31" }),
    });
    render(ui);

    expect(
      screen.getByText("Payday must be between 1 and 31")
    ).toBeInTheDocument();
  });
});

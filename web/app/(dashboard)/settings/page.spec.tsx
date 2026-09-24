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

const { getMyAccountsMock } = vi.hoisted(() => ({ getMyAccountsMock: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ getMyAccounts: getMyAccountsMock }));

const { ImportCsvModalMock } = vi.hoisted(() => ({
  ImportCsvModalMock: vi.fn(() => <div data-testid="import-csv-modal-stub" />),
}));
vi.mock("@/components/ImportCsvModal", () => ({
  default: ImportCsvModalMock,
}));

// Mocking "@/app/actions" keeps the real Server Action — which imports
// "@/lib/internal-auth" (`import "server-only"`) — out of the test's module
// graph, same pattern already used by "(dashboard)/page.spec.tsx".
vi.mock("@/app/actions", () => ({
  updateSettingsAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

import SettingsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMySettingsMock.mockReset();
  getMyAccountsMock.mockReset();
  ImportCsvModalMock.mockClear();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getMySettingsMock.mockResolvedValue({
    essential_spend: null,
    payday: null,
    horizon_days: 30,
  });
  getMyAccountsMock.mockResolvedValue([
    {
      id: 1,
      name: "Cont curent",
      current_balance: "0.00",
      reference_date: "2026-01-01",
      opening_boundary: "start_of_day" as const, configured: true,
      balance: "100.00",
    },
  ]);
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

  it("renders the Data card with an export link and the import modal", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const exportLink = screen.getByRole("link", { name: "Export CSV" });
    expect(exportLink).toHaveAttribute("href", "/api/export");
    expect(screen.getByTestId("import-csv-modal-stub")).toBeInTheDocument();
  });

  it("renders the delete-account form with a password field", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete account permanently" })
    ).toBeInTheDocument();
  });

  it("shows the delete-account error message from searchParams.deleteError", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ deleteError: "Invalid password" }),
    });
    render(ui);

    expect(screen.getByText("Invalid password")).toBeInTheDocument();
  });

  it("fetches accounts alongside settings", async () => {
    await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });

    expect(getMyAccountsMock).toHaveBeenCalledTimes(1);
  });

  // S03.6: CSV import creates new transaction rows in the target account —
  // the same "pick an account for NEW money" action the transaction and
  // recurring-rule pickers already exclude archived accounts from.
  it("excludes archived accounts from ImportCsvModal's account list", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "Active", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: false, protectedSavings: false, balance: "100.00" },
      { id: 2, name: "Old account", current_balance: "0.00", reference_date: "2026-01-01", opening_boundary: "start_of_day" as const, configured: true, archived: true, protectedSavings: false, balance: "50.00" },
    ]);

    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const [props] = ImportCsvModalMock.mock.calls[0] as unknown as [
      { accounts: { id: number }[] },
    ];
    expect(props.accounts.map((a) => a.id)).toEqual([1]);
  });
});

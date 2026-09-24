import { describe, expect, it } from "vitest";
import { selectableAccounts } from "./account-filters";
import type { Account } from "./accounts";

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    name: "Test",
    current_balance: "0",
    reference_date: "2026-01-01",
    opening_boundary: "start_of_day",
    configured: true,
    archived: false,
    protectedSavings: false,
    balance: "0",
    ...overrides,
  };
}

describe("selectableAccounts", () => {
  it("excludes archived accounts", () => {
    const accounts = [
      account({ id: 1, archived: false }),
      account({ id: 2, archived: true }),
    ];

    expect(selectableAccounts(accounts).map((a) => a.id)).toEqual([1]);
  });

  it("keeps protected-savings accounts that are not archived", () => {
    const accounts = [account({ id: 1, archived: false, protectedSavings: true })];

    expect(selectableAccounts(accounts).map((a) => a.id)).toEqual([1]);
  });
});

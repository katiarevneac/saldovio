import type { Account } from "./accounts";

// S03.6: archived accounts stay in every total/aggregate — this only
// keeps them out of pickers where a user chooses where to record NEW
// money (transaction form, recurring-rule form).
export function selectableAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => !account.archived);
}

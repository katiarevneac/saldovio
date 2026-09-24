import "server-only";
import { FINANCE_API_URL } from "./config";
import { getAuthorizedHeaders } from "./internal-auth";

export type Account = {
  id: number;
  name: string;
  current_balance: string;
  reference_date: string;
  opening_boundary: "legacy_inclusive" | "start_of_day";
  configured: boolean;
  archived: boolean;
  protectedSavings: boolean;
  balance: string;
};

export async function getMyAccounts(): Promise<Account[]> {
  const headers = await getAuthorizedHeaders();
  const response = await fetch(`${FINANCE_API_URL}/accounts/me`, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Finance API returned ${response.status}`);
  }

  return response.json();
}

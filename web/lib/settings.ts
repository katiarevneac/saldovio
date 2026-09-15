import "server-only";
import { FINANCE_API_URL } from "./config";
import { getAuthorizedHeaders } from "./internal-auth";

export type Settings = {
  essential_spend: string | null;
  payday: number | null;
  horizon_days: number;
};

export async function getMySettings(): Promise<Settings> {
  const headers = await getAuthorizedHeaders();
  const response = await fetch(`${FINANCE_API_URL}/users/me/settings`, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Finance API returned ${response.status}`);
  }

  return response.json();
}

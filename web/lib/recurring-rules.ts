import "server-only";
import { FINANCE_API_URL } from "./config";
import { getAuthorizedHeaders } from "./internal-auth";

export type RecurringRule = {
  id: number;
  account_id: number;
  type: "income" | "expense";
  amount: string;
  frequency: "monthly";
  day_of_month: number;
  category: string | null;
  active: boolean;
};

export async function getMyRecurringRules(): Promise<RecurringRule[]> {
  const headers = await getAuthorizedHeaders();
  const response = await fetch(`${FINANCE_API_URL}/recurring-rules`, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Finance API returned ${response.status}`);
  }

  return response.json();
}

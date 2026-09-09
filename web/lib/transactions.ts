import "server-only";
import { FINANCE_API_URL } from "./config";
import { getAuthorizedHeaders } from "./internal-auth";

export type Transaction = {
  id: number;
  account_id: number;
  type: "income" | "expense" | "transfer";
  amount: string;
  occurred_on: string;
  category: string | null;
};

export async function getTransactions(): Promise<Transaction[]> {
  const headers = await getAuthorizedHeaders();
  const response = await fetch(`${FINANCE_API_URL}/transactions`, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Finance API returned ${response.status}`);
  }

  return response.json();
}

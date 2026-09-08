// Local dev only — becomes an env var once this ever deploys
// somewhere other than localhost.
const FINANCE_API_URL = "http://localhost:3000";

export type Transaction = {
  id: number;
  account_id: number;
  type: "income" | "expense" | "transfer";
  amount: string;
  occurred_on: string;
  category: string | null;
};

export async function getTransactions(): Promise<Transaction[]> {
  const response = await fetch(`${FINANCE_API_URL}/transactions`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Finance API returned ${response.status}`);
  }

  return response.json();
}

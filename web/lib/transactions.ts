import { FINANCE_API_URL } from "./config";

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

export type CreateTransactionPayload = {
  accountId: number;
  type: "income" | "expense" | "transfer";
  amount: number;
  occurredOn: string;
  category?: string;
};

export async function createTransaction(
  payload: CreateTransactionPayload
): Promise<void> {
  const response = await fetch(`${FINANCE_API_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message ?? `Finance API returned ${response.status}`);
  }
}

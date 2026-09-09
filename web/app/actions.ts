"use server";

import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";
import { getMyAccount } from "@/lib/accounts";

export type CreateTransactionInput = {
  type: "income" | "expense";
  amount: number;
  occurredOn: string;
  category?: string;
};

export async function createTransactionAction(
  input: CreateTransactionInput
): Promise<void> {
  const [account, headers] = await Promise.all([
    getMyAccount(),
    getAuthorizedHeaders(),
  ]);

  const response = await fetch(`${FINANCE_API_URL}/transactions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: account.id, ...input }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message ?? `Finance API returned ${response.status}`);
  }
}

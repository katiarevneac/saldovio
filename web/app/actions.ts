"use server";

import { redirect } from "next/navigation";
import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";

export type CreateTransactionInput = {
  accountId: number;
  type: "income" | "expense";
  amount: number;
  occurredOn: string;
  category?: string;
};

export async function createTransactionAction(
  input: CreateTransactionInput
): Promise<void> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/transactions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(message ?? `Finance API returned ${response.status}`);
  }
}

export async function createAccountAction(formData: FormData): Promise<void> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/accounts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: formData.get("name"),
      currentBalance: Number(formData.get("currentBalance")),
      referenceDate: formData.get("referenceDate"),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Could not create account");
    redirect(`/accounts/new?error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

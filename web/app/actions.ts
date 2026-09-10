"use server";

import { redirect } from "next/navigation";
import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";
import { extractApiErrorMessage } from "@/lib/api-errors";
import { CreateAccountSchema } from "@/lib/schemas/accounts";

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
    const message = await extractApiErrorMessage(response, `Finance API returned ${response.status}`);
    throw new Error(message);
  }
}

export async function createAccountAction(formData: FormData): Promise<void> {
  const parsed = CreateAccountSchema.safeParse({
    name: formData.get("name"),
    currentBalance: formData.get("currentBalance"),
    referenceDate: formData.get("referenceDate"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/accounts/new?error=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/accounts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not create account");
    redirect(`/accounts/new?error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

export async function createRecurringRuleAction(formData: FormData): Promise<void> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/recurring-rules`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      accountId: Number(formData.get("accountId")),
      type: formData.get("type"),
      amount: Number(formData.get("amount")),
      dayOfMonth: Number(formData.get("dayOfMonth")),
      category: formData.get("category") || undefined,
    }),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not create recurring rule");
    redirect(`/recurring-rules/new?error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";
import { extractApiErrorMessage } from "@/lib/api-errors";
import { CreateAccountSchema, UpdateAccountSchema } from "@/lib/schemas/accounts";
import { CreateRecurringRuleSchema } from "@/lib/schemas/recurring-rules";
import { UpdateSettingsSchema, DeleteAccountSchema } from "@/lib/schemas/settings";
import type { ImportPreviewRow, ImportCommitRow } from "@/lib/import";

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

  redirect("/accounts");
}

export async function updateAccountAction(accountId: number, formData: FormData): Promise<void> {
  const parsed = UpdateAccountSchema.safeParse({
    name: formData.get("name"),
    currentBalance: formData.get("currentBalance"),
    referenceDate: formData.get("referenceDate"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/accounts/${accountId}/edit?error=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/accounts/${accountId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not update account");
    redirect(`/accounts/${accountId}/edit?error=${encodeURIComponent(message)}`);
  }

  redirect("/accounts");
}

export async function createRecurringRuleAction(formData: FormData): Promise<void> {
  const parsed = CreateRecurringRuleSchema.safeParse({
    accountId: formData.get("accountId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    dayOfMonth: formData.get("dayOfMonth"),
    category: formData.get("category") || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/recurring-rules/new?error=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/recurring-rules`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not create recurring rule");
    redirect(`/recurring-rules/new?error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const parsed = UpdateSettingsSchema.safeParse({
    essentialSpend: formData.get("essentialSpend"),
    payday: formData.get("payday"),
    horizonDays: formData.get("horizonDays"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/users/me/settings`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not update settings");
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }

  redirect("/settings?saved=1");
}

export async function previewImportAction(
  formData: FormData
): Promise<{ rows: ImportPreviewRow[] }> {
  const headers = await getAuthorizedHeaders();

  // formData carries a File under "file" plus "accountId" — do NOT set
  // a Content-Type header here, fetch generates the multipart boundary
  // itself from the FormData body.
  const response = await fetch(`${FINANCE_API_URL}/transactions/import/preview`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not preview import");
    throw new Error(message);
  }

  return response.json();
}

export async function commitImportAction(input: {
  accountId: number;
  rows: ImportCommitRow[];
}): Promise<{ imported: number; skipped_duplicates: number }> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/transactions/import/commit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not commit import");
    throw new Error(message);
  }

  return response.json();
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const parsed = DeleteAccountSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/settings?deleteError=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/users/me`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not delete account");
    redirect(`/settings?deleteError=${encodeURIComponent(message)}`);
  }

  await signOut({ redirectTo: "/login" });
}

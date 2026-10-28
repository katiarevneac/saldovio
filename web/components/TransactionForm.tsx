"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTransactionAction, createTransferAction } from "@/app/actions";
import type { Account } from "@/lib/accounts";
import { isBackdated } from "@/lib/backdated";
import { CreateTransactionSchema, CreateTransferSchema } from "@/lib/schemas/transactions";
import styles from "./TransactionForm.module.css";

export default function TransactionForm({
  accounts,
  onSuccess,
}: {
  accounts: Account[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ""));
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [sourceId, setSourceId] = useState(String(accounts[0]?.id ?? ""));
  const [destinationId, setDestinationId] = useState(String(accounts[1]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = accounts.find((account) => String(account.id) === accountId);
  const backdated =
    !!selectedAccount &&
    !!occurredOn &&
    isBackdated(occurredOn, selectedAccount.reference_date, selectedAccount.opening_boundary);

  const isTransfer = type === "transfer";
  const canTransfer = accounts.length >= 2;
  const transferBackdatedAccounts = isTransfer && occurredOn
    ? [sourceId, destinationId]
        .map((id) => accounts.find((account) => String(account.id) === id))
        .filter(
          (account): account is Account =>
            !!account && isBackdated(occurredOn, account.reference_date, account.opening_boundary),
        )
    : [];
  const transferBlocked = transferBackdatedAccounts.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTransfer && transferBlocked) return;
    if (submitting) return;
    setError("");
    setSubmitting(true);

    // The form always collects a positive number; the sign is derived
    // from the selected type, not typed by the user.
    const enteredAmount = Number(amount);

    if (type === "transfer") {
      const parsedTransfer = CreateTransferSchema.safeParse({
        sourceAccountId: Number(sourceId),
        destinationAccountId: Number(destinationId),
        amount: Math.abs(enteredAmount),
        occurredOn,
        category: category || undefined,
      });
      if (!parsedTransfer.success) {
        setError(parsedTransfer.error.issues.map((issue) => issue.message).join(", "));
        setSubmitting(false);
        return;
      }
      try {
        await createTransferAction(parsedTransfer.data);
        setAmount("");
        setOccurredOn("");
        setCategory("");
        router.refresh();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const signedAmount =
      type === "expense" ? -Math.abs(enteredAmount) : Math.abs(enteredAmount);

    const parsed = CreateTransactionSchema.safeParse({
      accountId: Number(accountId),
      type,
      amount: signedAmount,
      occurredOn,
      category: category || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(", "));
      setSubmitting(false);
      return;
    }

    try {
      await createTransactionAction(parsed.data);
      setAmount("");
      setOccurredOn("");
      setCategory("");
      router.refresh();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {isTransfer ? (
        <>
          <div className={styles.field}>
            <label htmlFor="sourceAccountId">From</label>
            <select
              id="sourceAccountId"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="destinationAccountId">To</label>
            <select
              id="destinationAccountId"
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div className={styles.field}>
          <label htmlFor="accountId">Account</label>
          <select
            id="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="type">Type</label>
        <select
          id="type"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "expense" | "income" | "transfer")
          }
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer" disabled={!canTransfer}>
            Transfer
          </option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="occurredOn">Date</label>
        <input
          id="occurredOn"
          type="date"
          required
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
        />
        {transferBackdatedAccounts.map((account) => (
          <p key={account.id} className={styles.notice}>
            A transfer can&apos;t be dated on or before an account&apos;s opening balance:{" "}
            {account.name} ({account.reference_date}).
          </p>
        ))}
        {!isTransfer && backdated && (
          <p className={styles.notice}>
            This date is on or before this account&apos;s opening balance
            ({selectedAccount!.reference_date}) — it will be saved for history
            but won&apos;t change the account&apos;s current balance.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="category">Category</label>
        <input
          id="category"
          type="text"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" disabled={submitting || transferBlocked}>
        {submitting ? "Saving…" : "Add transaction"}
      </button>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTransactionAction } from "@/app/actions";
import type { Account } from "@/lib/accounts";
import styles from "./TransactionForm.module.css";

export default function TransactionForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ""));
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    // The form always collects a positive number; the sign is derived
    // from the selected type, not typed by the user.
    const enteredAmount = Number(amount);
    const signedAmount =
      type === "expense" ? -Math.abs(enteredAmount) : Math.abs(enteredAmount);

    try {
      await createTransactionAction({
        accountId: Number(accountId),
        type,
        amount: signedAmount,
        occurredOn,
        category: category || undefined,
      });
      setAmount("");
      setOccurredOn("");
      setCategory("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
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

      <div className={styles.field}>
        <label htmlFor="type">Type</label>
        <select
          id="type"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "expense" | "income")
          }
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
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

      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Add transaction"}
      </button>
    </form>
  );
}

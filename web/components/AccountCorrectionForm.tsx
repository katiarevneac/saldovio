"use client";

import { useState } from "react";
import { updateAccountAction } from "@/app/actions";
import { toBani, formatAmount } from "@/lib/money";
import { computeBalancePreview, type OpeningBoundary } from "@/lib/account-balance-preview";
import styles from "./AccountCorrectionForm.module.css";

export default function AccountCorrectionForm({
  accountId,
  name: initialName,
  currentBalance,
  referenceDate: initialReferenceDate,
  openingBoundary,
  transactions,
  today,
}: {
  accountId: number;
  name: string;
  currentBalance: string;
  referenceDate: string;
  openingBoundary: OpeningBoundary;
  transactions: { occurredOn: string; amountBani: number }[];
  today: string;
}) {
  const [name, setName] = useState(initialName);
  const [currentBalanceInput, setCurrentBalanceInput] = useState(currentBalance);
  const [referenceDate, setReferenceDate] = useState(initialReferenceDate);

  const previewBani = computeBalancePreview({
    currentBalanceBani: toBani(currentBalanceInput),
    referenceDate,
    openingBoundary,
    transactions,
    today,
  });

  return (
    <form className={styles.form} action={updateAccountAction.bind(null, accountId)}>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="currentBalance">Starting balance</label>
        <input
          id="currentBalance"
          name="currentBalance"
          type="number"
          step="0.01"
          value={currentBalanceInput}
          onChange={(event) => setCurrentBalanceInput(event.target.value)}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="referenceDate">As of date</label>
        <input
          id="referenceDate"
          name="referenceDate"
          type="date"
          value={referenceDate}
          onChange={(event) => setReferenceDate(event.target.value)}
          required
        />
        <p className={styles.boundaryNote}>
          {openingBoundary === "legacy_inclusive"
            ? "Transactions dated exactly on this day are already counted in the starting balance above."
            : "Transactions dated exactly on this day are counted in addition to the starting balance above."}
        </p>
      </div>

      <p className={styles.preview} data-testid="balance-preview">
        New balance: {formatAmount(previewBani)}
      </p>

      <button type="submit">Save</button>
    </form>
  );
}

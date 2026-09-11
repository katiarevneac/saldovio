"use client";

import { useState } from "react";
import type { Transaction } from "@/lib/transactions";
import { toBani, formatAmount } from "@/lib/money";
import {
  transactionLabel,
  extractCategoryLabels,
  filterTransactions,
  sortTransactionsDesc,
  groupTransactionsByDay,
} from "@/lib/transaction-filters";
import styles from "./TransactionsExplorer.module.css";

type Density = "compact" | "comfortable" | "by-day";

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "by-day", label: "By day" },
];

export default function TransactionsExplorer({
  transactions,
  accountNameById,
}: {
  transactions: Transaction[];
  accountNameById: Record<number, string>;
}) {
  const [search, setSearch] = useState("");
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");

  const categories = extractCategoryLabels(transactions);
  const sorted = sortTransactionsDesc(transactions);
  const filtered = filterTransactions(sorted, { search, categoryLabel });

  function amountClass(bani: number) {
    return bani < 0 ? styles.expense : styles.income;
  }

  function renderRow(transaction: Transaction) {
    const bani = toBani(transaction.amount);
    return (
      <tr key={transaction.id}>
        <td>{transaction.occurred_on}</td>
        <td>
          <span className={styles.pill}>{transactionLabel(transaction)}</span>
        </td>
        <td>{accountNameById[transaction.account_id] ?? "—"}</td>
        <td className={`${styles.amount} ${amountClass(bani)}`}>{formatAmount(bani)}</td>
      </tr>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.filterBar}>
        <input
          type="search"
          aria-label="Search transactions"
          placeholder="Search category or type"
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className={styles.chipRow} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={styles.chip}
            aria-pressed={categoryLabel === null}
            onClick={() => setCategoryLabel(null)}
          >
            All
          </button>
          {categories.map((label) => (
            <button
              key={label}
              type="button"
              className={styles.chip}
              aria-pressed={categoryLabel === label}
              onClick={() => setCategoryLabel(categoryLabel === label ? null : label)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.densityRow} role="group" aria-label="Density">
          {DENSITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.densityButton}
              aria-pressed={density === option.value}
              onClick={() => setDensity(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.emptyState}>No transactions match your filters.</p>
      ) : density === "by-day" ? (
        <div className={styles.dayGroups}>
          {groupTransactionsByDay(filtered).map((group) => (
            <div key={group.date} className={styles.dayGroup}>
              <h3 className={styles.dayHeading}>{group.date}</h3>
              <ul className={styles.dayList}>
                {group.items.map((transaction) => {
                  const bani = toBani(transaction.amount);
                  return (
                    <li key={transaction.id} className={styles.dayRow}>
                      <span className={styles.pill}>{transactionLabel(transaction)}</span>
                      <span>{accountNameById[transaction.account_id] ?? "—"}</span>
                      <span className={`${styles.amount} ${amountClass(bani)}`}>
                        {formatAmount(bani)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table} data-density={density}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Account</th>
              <th className={styles.amountHeader}>Amount</th>
            </tr>
          </thead>
          <tbody>{filtered.map(renderRow)}</tbody>
        </table>
      )}
    </div>
  );
}

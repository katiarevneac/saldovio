import { describe, expect, it } from "vitest";
import {
  transactionLabel,
  extractCategoryLabels,
  filterTransactions,
  sortTransactionsDesc,
  groupTransactionsByDay,
} from "./transaction-filters";
import type { Transaction } from "./transactions";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    account_id: 1,
    type: "expense",
    amount: "-10.00",
    occurred_on: "2026-09-10",
    category: null,
    ...overrides,
  };
}

describe("transactionLabel", () => {
  it("uses category when present", () => {
    expect(transactionLabel(tx({ category: "Groceries" }))).toBe("Groceries");
  });

  it("falls back to type when category is null", () => {
    expect(transactionLabel(tx({ category: null, type: "income" }))).toBe("income");
  });
});

describe("extractCategoryLabels", () => {
  it("returns unique labels sorted alphabetically", () => {
    const labels = extractCategoryLabels([
      tx({ id: 1, category: "Transport" }),
      tx({ id: 2, category: "Groceries" }),
      tx({ id: 3, category: "Groceries" }),
      tx({ id: 4, category: null, type: "income" }),
    ]);
    expect(labels).toEqual(["Groceries", "income", "Transport"].sort((a, b) => a.localeCompare(b)));
  });

  it("returns an empty array for no transactions", () => {
    expect(extractCategoryLabels([])).toEqual([]);
  });
});

describe("filterTransactions", () => {
  const transactions = [
    tx({ id: 1, category: "Groceries" }),
    tx({ id: 2, category: "Transport" }),
    tx({ id: 3, category: null, type: "income" }),
  ];

  it("returns everything when search is empty and category is null", () => {
    expect(filterTransactions(transactions, { search: "", categoryLabel: null })).toHaveLength(3);
  });

  it("filters by exact category label", () => {
    const result = filterTransactions(transactions, { search: "", categoryLabel: "Groceries" });
    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("filters by case-insensitive search substring against the label", () => {
    const result = filterTransactions(transactions, { search: "trans", categoryLabel: null });
    expect(result.map((t) => t.id)).toEqual([2]);
  });

  it("combines search and category filters", () => {
    const result = filterTransactions(transactions, { search: "groc", categoryLabel: "Groceries" });
    expect(result.map((t) => t.id)).toEqual([1]);

    const empty = filterTransactions(transactions, { search: "groc", categoryLabel: "Transport" });
    expect(empty).toEqual([]);
  });
});

describe("sortTransactionsDesc", () => {
  it("sorts by occurred_on descending, then id descending on ties", () => {
    const result = sortTransactionsDesc([
      tx({ id: 1, occurred_on: "2026-09-01" }),
      tx({ id: 2, occurred_on: "2026-09-05" }),
      tx({ id: 3, occurred_on: "2026-09-05" }),
    ]);
    expect(result.map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [tx({ id: 1, occurred_on: "2026-09-01" }), tx({ id: 2, occurred_on: "2026-09-05" })];
    const copy = [...input];
    sortTransactionsDesc(input);
    expect(input).toEqual(copy);
  });
});

describe("groupTransactionsByDay", () => {
  it("groups consecutive same-date transactions, preserving order", () => {
    const groups = groupTransactionsByDay([
      tx({ id: 1, occurred_on: "2026-09-05" }),
      tx({ id: 2, occurred_on: "2026-09-05" }),
      tx({ id: 3, occurred_on: "2026-09-01" }),
    ]);
    expect(groups).toEqual([
      { date: "2026-09-05", items: [tx({ id: 1, occurred_on: "2026-09-05" }), tx({ id: 2, occurred_on: "2026-09-05" })] },
      { date: "2026-09-01", items: [tx({ id: 3, occurred_on: "2026-09-01" })] },
    ]);
  });

  it("returns an empty array for no transactions", () => {
    expect(groupTransactionsByDay([])).toEqual([]);
  });
});

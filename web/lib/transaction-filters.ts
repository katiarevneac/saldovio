import type { Transaction } from "./transactions";

// Every place the design mockup shows a "description", this codebase's
// data model has no such field — category (freeform, optional) is the
// closest thing, falling back to type. Same convention already used on
// the Overview page (page.tsx, recurring-rules/recent-transactions rows).
export function transactionLabel(
  transaction: Pick<Transaction, "category" | "type">
): string {
  return transaction.category ?? transaction.type;
}

export function extractCategoryLabels(transactions: Transaction[]): string[] {
  const labels = new Set(transactions.map(transactionLabel));
  return [...labels].sort((a, b) => a.localeCompare(b));
}

export type TransactionFilters = {
  search: string;
  categoryLabel: string | null;
};

export function filterTransactions(
  transactions: Transaction[],
  { search, categoryLabel }: TransactionFilters
): Transaction[] {
  const query = search.trim().toLowerCase();
  return transactions.filter((transaction) => {
    const label = transactionLabel(transaction);
    if (categoryLabel && label !== categoryLabel) return false;
    if (query && !label.toLowerCase().includes(query)) return false;
    return true;
  });
}

// Same comparator Overview's "recent transactions" card already uses
// (page.tsx) — kept identical rather than importing across a
// server/client boundary since this module has no dependency on it.
export function sortTransactionsDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.occurred_on === b.occurred_on
      ? b.id - a.id
      : a.occurred_on < b.occurred_on
        ? 1
        : -1
  );
}

export type TransactionDayGroup = {
  date: string;
  items: Transaction[];
};

// Assumes the input is already sorted (by sortTransactionsDesc) so that
// same-date transactions are contiguous — does not sort internally.
export function groupTransactionsByDay(transactions: Transaction[]): TransactionDayGroup[] {
  const groups: TransactionDayGroup[] = [];
  for (const transaction of transactions) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === transaction.occurred_on) {
      lastGroup.items.push(transaction);
    } else {
      groups.push({ date: transaction.occurred_on, items: [transaction] });
    }
  }
  return groups;
}

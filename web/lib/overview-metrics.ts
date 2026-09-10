import type { Transaction } from "./transactions";
import { toBani } from "./money";

export type MonthlyTotals = {
  incomeBani: number;
  expenseBani: number;
  surplusBani: number;
};

// Excludes transfers — a transfer between the user's own accounts is
// never income or expense at the aggregate level (brief §11 rule 1).
export function computeMonthlyTotals(
  transactions: Transaction[],
  yearMonth: string
): MonthlyTotals {
  let incomeBani = 0;
  let expenseBani = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;
    if (!transaction.occurred_on.startsWith(yearMonth)) continue;

    const bani = toBani(transaction.amount);
    if (transaction.type === "income") {
      incomeBani += bani;
    } else {
      expenseBani += bani;
    }
  }

  return {
    incomeBani,
    expenseBani,
    surplusBani: incomeBani + expenseBani,
  };
}

// Local calendar date, matching the convention already used by
// web/lib/analytics.ts's todayDateString (getFullYear/getMonth/getDate,
// not toISOString/UTC).
export function currentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

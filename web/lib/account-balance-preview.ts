import { isBackdated } from "./backdated";

// Reuses isBackdated's inclusion predicate (ADR 0002's two boundary
// formulas) rather than a third reimplementation of it within the same
// web layer — openingBoundary is read-only here, never derived or
// changed by this function.
export type OpeningBoundary = "legacy_inclusive" | "start_of_day";

export function computeBalancePreview(params: {
  currentBalanceBani: number;
  referenceDate: string; // YYYY-MM-DD
  openingBoundary: OpeningBoundary;
  transactions: { occurredOn: string; amountBani: number }[];
  today: string; // YYYY-MM-DD
}): number {
  const { currentBalanceBani, referenceDate, openingBoundary, transactions, today } = params;

  const sumBani = transactions.reduce((total, t) => {
    if (t.occurredOn > today) return total;
    const included = !isBackdated(t.occurredOn, referenceDate, openingBoundary);
    return included ? total + t.amountBani : total;
  }, 0);

  return currentBalanceBani + sumBani;
}

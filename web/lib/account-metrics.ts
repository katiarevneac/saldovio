// Zero-denominator indicators return an explicit "unavailable" state, never
// a fabricated value or a NaN from dividing by zero (brief §11 rule 6).
export function computePercentOfTotal(
  accountBani: number,
  totalBani: number
): number | null {
  if (totalBani <= 0) return null;
  return (accountBani / totalBani) * 100;
}

export function formatPercent(percent: number | null): string {
  if (percent === null) return "% of total: unavailable";
  return `${percent.toFixed(1)}% of total`;
}

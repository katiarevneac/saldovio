// The API returns amounts as exact decimal strings (Postgres numeric,
// e.g. "-75.20"). Convert to integer bani via string parsing, not
// parseFloat + arithmetic — that would reintroduce float rounding
// error. Same rule as prototype/app.js, ported here.
export function toBani(decimalString: string): number {
  const [wholePart, fractionPart = ""] = decimalString.split(".");
  const paddedFraction = (fractionPart + "00").slice(0, 2);
  const sign = wholePart.startsWith("-") ? -1 : 1;
  const wholeDigits = wholePart.replace("-", "");
  return sign * (Number(wholeDigits) * 100 + Number(paddedFraction));
}

export function formatAmount(bani: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
  }).format(bani / 100);
}

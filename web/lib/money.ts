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

// Inverse of toBani — needed to send the aggregate balance (computed
// as integer bani, to avoid float error while summing) back out as a
// decimal string for Analytics Service's Decimal-typed request field.
export function baniToDecimalString(bani: number): string {
  const sign = bani < 0 ? "-" : "";
  const absBani = Math.abs(bani);
  const wholePart = Math.floor(absBani / 100);
  const centsPart = absBani % 100;
  return `${sign}${wholePart}.${String(centsPart).padStart(2, "0")}`;
}

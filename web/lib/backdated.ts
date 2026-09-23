// ADR 0002's two balance formulas, restated as a single predicate — mirrors
// finance-api/src/common/backdated.ts. A separate, independent
// reimplementation on purpose (financial-rules.md §3's standing "reverify
// date logic at every layer" pattern), so the web-side preview can't drift
// silently from the balance formula it's explaining. "YYYY-MM-DD" strings
// compare correctly with plain lexical operators — no Date object.
export function isBackdated(
  occurredOn: string,
  referenceDate: string,
  openingBoundary: "legacy_inclusive" | "start_of_day",
): boolean {
  return openingBoundary === "legacy_inclusive"
    ? occurredOn <= referenceDate
    : occurredOn < referenceDate;
}

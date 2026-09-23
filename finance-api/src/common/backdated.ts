// ADR 0002's two balance formulas, restated as a single predicate: does
// this occurredOn date fall inside the account's opening snapshot rather
// than after it? A transaction inside the snapshot is stored for history
// but never moves current_balance (S03.4's preview is what tells the
// user that before they save it). "YYYY-MM-DD" strings compare correctly
// with plain lexical operators — no Date object, per this project's
// standing date-math rule (financial-rules.md §3).
export function isBackdated(
  occurredOn: string,
  referenceDate: string,
  openingBoundary: 'legacy_inclusive' | 'start_of_day',
): boolean {
  return openingBoundary === 'legacy_inclusive'
    ? occurredOn <= referenceDate
    : occurredOn < referenceDate;
}

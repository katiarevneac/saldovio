import type { RecurringRule } from "./recurring-rules";

export type RuleOccurrence = { date: string; rule: RecurringRule };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// Same clamp rule as analytics-service/forecast.py's _clamped_occurrence:
// day_of_month 31 in a 30-day month becomes that month's last real day.
function clampedOccurrenceDate(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

// Window is [calculationDate, windowEndDate) — inclusive start, exclusive
// end — identical convention to analytics-service/forecast.py's
// _occurrences_in_window. A forecast window is at most ~31 days, so it
// can only ever touch 2 calendar months; 3 is checked as a small, cheap
// safety margin, never load-bearing for correctness (the date-range
// filter below excludes anything found beyond the real window either way).
//
// No Date objects: dates are compared as strings, which is valid because
// every date here is a zero-padded ISO YYYY-MM-DD string (lexicographic
// order matches chronological order).
export function occurrencesInWindow(
  rules: RecurringRule[],
  calculationDate: string,
  windowEndDate: string
): RuleOccurrence[] {
  const results: RuleOccurrence[] = [];
  const startYear = Number(calculationDate.slice(0, 4));
  const startMonth = Number(calculationDate.slice(5, 7));

  for (const rule of rules) {
    let year = startYear;
    let month = startMonth;

    for (let monthsChecked = 0; monthsChecked < 3; monthsChecked++) {
      const occurrence = clampedOccurrenceDate(year, month, rule.day_of_month);

      if (occurrence >= calculationDate && occurrence < windowEndDate) {
        results.push({ date: occurrence, rule });
      }
      if (occurrence >= windowEndDate) break;

      [year, month] = nextMonth(year, month);
    }
  }

  return results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

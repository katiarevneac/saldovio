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
// _occurrences_in_window.
//
// The real exit condition is `occurrence >= windowEndDate` below. The
// iteration ceiling is only a safety net against a malformed windowEndDate
// that never satisfies that break (which would otherwise loop forever); it
// must never be the thing that ends a legitimate window. Since horizonDays
// is settable up to 365 (and analytics-service bounds the window at 366
// days), a real window can span ~13 calendar months, so 400 leaves a wide
// margin above anything reachable.
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

    for (let monthsChecked = 0; monthsChecked < 400; monthsChecked++) {
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

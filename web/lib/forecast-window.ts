// Window boundary for the "sold estimat" forecast: [today, windowEnd).
// Self-contained date-string math (no Date object), matching the same
// convention already established independently in web/lib/simulator.ts
// and web/lib/forecast-occurrences.ts — this project's standing pattern
// of re-verifying date/money logic at each layer rather than sharing a
// single implementation across unrelated call sites.

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

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

function clampedDate(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function nextDate(dateString: string): string {
  const year = Number(dateString.slice(0, 4));
  const month = Number(dateString.slice(5, 7));
  const day = Number(dateString.slice(8, 10));

  if (day < daysInMonth(year, month)) {
    return `${year}-${pad2(month)}-${pad2(day + 1)}`;
  }
  const [nextYear, nextMonthNum] = nextMonth(year, month);
  return `${nextYear}-${pad2(nextMonthNum)}-01`;
}

function addDays(dateString: string, days: number): string {
  let result = dateString;
  for (let i = 0; i < days; i++) {
    result = nextDate(result);
  }
  return result;
}

// `payday` clamps to the month's last real day when it exceeds it — same
// nonexistent-day convention as RecurringRule.dayOfMonth (brief §11 rule 5).
// When payday is set, the window ends at its next STRICTLY FUTURE occurrence
// — if today IS payday, that means next month's, not today (a zero/negative
// -length window would be meaningless). When payday is unset, the window
// falls back to today + horizonDays, matching every existing user's
// unmodified 30-day behavior.
export function computeWindowEnd(
  today: string,
  payday: number | null,
  horizonDays: number
): string {
  if (payday === null) {
    return addDays(today, horizonDays);
  }

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const thisMonthPayday = clampedDate(year, month, payday);
  if (thisMonthPayday > today) {
    return thisMonthPayday;
  }

  const [nextYear, nextMonthNum] = nextMonth(year, month);
  return clampedDate(nextYear, nextMonthNum, payday);
}

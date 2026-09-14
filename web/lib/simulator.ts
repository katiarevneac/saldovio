import type { RecurringRule } from "./recurring-rules";
import { toBani, baniToDecimalString } from "./money";
import type { DailyBalance } from "./analytics";

export const SIMULATOR_WINDOW_DAYS = 30;
// Expressed as an exact integer fraction (not a float) so the verdict
// comparison never does floating-point arithmetic on money — 1/10 = 10%.
export const TIGHT_THRESHOLD_NUMERATOR = 1;
export const TIGHT_THRESHOLD_DENOMINATOR = 10;

export type Verdict = "yes" | "tight" | "no";

export type SimulatorResult = {
  calculationDate: string;
  windowEndDate: string;
  baseSeries: DailyBalance[];
  afterSeries: DailyBalance[];
  minimumAfterBani: number;
  minimumAfterDate: string;
  verdict: Verdict;
};

// Independent of web/lib/forecast-occurrences.ts by design — a second,
// separately-written occurrence engine so the simulator and the forecast
// chart can act as a cross-check on each other, per CLAUDE.md's standing
// "reverify money/date logic at every layer" pattern (pg, Pydantic, Prisma,
// forecast-occurrences.ts, and now this).

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

// Advances a YYYY-MM-DD string by exactly one calendar day, without
// constructing a Date object.
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

function addWindowDays(dateString: string, days: number): string {
  let result = dateString;
  for (let i = 0; i < days; i++) {
    result = nextDate(result);
  }
  return result;
}

// Window is [windowStart, windowEnd) — inclusive start, exclusive end,
// matching analytics-service/forecast.py's _occurrences_in_window and
// web/lib/forecast-occurrences.ts's occurrencesInWindow convention. A
// simulator window is at most ~31 days, so it can only ever touch 2
// calendar months; 3 is a small, cheap safety margin, never load-bearing.
export function monthlyRuleOccurrences(
  rules: RecurringRule[],
  windowStart: string,
  windowEnd: string
): { date: string; rule: RecurringRule }[] {
  const occurrences: { date: string; rule: RecurringRule }[] = [];
  const startYear = Number(windowStart.slice(0, 4));
  const startMonth = Number(windowStart.slice(5, 7));

  for (const rule of rules) {
    let year = startYear;
    let month = startMonth;

    for (let monthsChecked = 0; monthsChecked < 3; monthsChecked++) {
      const candidate = clampedDate(year, month, rule.day_of_month);

      if (candidate >= windowEnd) break;
      if (candidate >= windowStart) {
        occurrences.push({ date: candidate, rule });
      }
      [year, month] = nextMonth(year, month);
    }
  }

  return occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Purchase is assumed to happen today — subtracted from every day of the
// window, from day 0 onward, per the spec (no purchase-date field exists).
export function simulatePurchase({
  currentBalanceBani,
  recurringRules,
  purchaseBani,
  calculationDate = todayDateString(),
}: {
  currentBalanceBani: number;
  recurringRules: RecurringRule[];
  purchaseBani: number;
  calculationDate?: string;
}): SimulatorResult {
  const windowEndDate = addWindowDays(calculationDate, SIMULATOR_WINDOW_DAYS);
  const occurrences = monthlyRuleOccurrences(recurringRules, calculationDate, windowEndDate);

  const deltasByDate = new Map<string, number>();
  for (const { date, rule } of occurrences) {
    const signedBani = toBani(rule.amount) * (rule.type === "expense" ? -1 : 1);
    deltasByDate.set(date, (deltasByDate.get(date) ?? 0) + signedBani);
  }

  const baseSeries: DailyBalance[] = [];
  const afterSeries: DailyBalance[] = [];
  let balanceBani = currentBalanceBani;
  let minimumAfterBani = Infinity;
  let minimumAfterDate = calculationDate;
  let date = calculationDate;

  while (true) {
    balanceBani += deltasByDate.get(date) ?? 0;
    const afterBani = balanceBani - purchaseBani;

    baseSeries.push({ date, balance: baniToDecimalString(balanceBani) });
    afterSeries.push({ date, balance: baniToDecimalString(afterBani) });

    if (afterBani < minimumAfterBani) {
      minimumAfterBani = afterBani;
      minimumAfterDate = date;
    }

    if (date === windowEndDate) break;
    date = nextDate(date);
  }

  // minimumAfterBani < (currentBalanceBani * NUMERATOR / DENOMINATOR), rewritten
  // as an integer cross-multiplication to avoid float division/multiplication.
  const isBelowThreshold =
    minimumAfterBani * TIGHT_THRESHOLD_DENOMINATOR <
    currentBalanceBani * TIGHT_THRESHOLD_NUMERATOR;
  const verdict: Verdict =
    minimumAfterBani < 0 ? "no" : isBelowThreshold ? "tight" : "yes";

  return {
    calculationDate,
    windowEndDate,
    baseSeries,
    afterSeries,
    minimumAfterBani,
    minimumAfterDate,
    verdict,
  };
}

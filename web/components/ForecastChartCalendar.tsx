"use client";

import { toBaniPoints, findMinimum } from "@/lib/forecast-chart-data";
import { occurrencesInWindow } from "@/lib/forecast-occurrences";
import { formatAmount, toBani } from "@/lib/money";
import type { RecurringRule } from "@/lib/recurring-rules";
import type { DailyBalance } from "@/lib/analytics";
import styles from "./ForecastChartCalendar.module.css";

type ForecastChartCalendarProps = {
  dailyBalances: DailyBalance[];
  recurringRules: RecurringRule[];
};

function shortDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

// Cell shade intensity normalized 0..1 against the series' own min/max.
// A degenerate series (every day the same balance, min === max) falls
// back to a fixed neutral shade rather than dividing by zero — this is
// a display-only fallback, not a financial figure, so brief §11 rule
// 6's "never a fabricated value" concern doesn't apply here the way it
// does to balances/forecasts.
function intensity(bani: number, minBani: number, maxBani: number): number {
  if (maxBani === minBani) return 0.5;
  return (bani - minBani) / (maxBani - minBani);
}

export default function ForecastChartCalendar({
  dailyBalances,
  recurringRules,
}: ForecastChartCalendarProps) {
  const points = toBaniPoints(dailyBalances);
  const minimum = findMinimum(points);
  const minBani = points.length > 0 ? Math.min(...points.map((p) => p.bani)) : 0;
  const maxBani = points.length > 0 ? Math.max(...points.map((p) => p.bani)) : 0;

  const windowEndDate = points.length > 0 ? points[points.length - 1].date : null;
  const calculationDate = points.length > 0 ? points[0].date : null;
  const occurrences =
    calculationDate && windowEndDate
      ? occurrencesInWindow(recurringRules, calculationDate, windowEndDate)
      : [];

  return (
    <div>
      <div className={styles.grid}>
        {points.map((point) => (
          <div
            key={point.date}
            className={styles.cell}
            data-testid={`forecast-day-cell-${point.date}`}
            data-minimum={minimum !== null && point.date === minimum.date ? "true" : "false"}
            style={{
              background: `color-mix(in srgb, var(--color-accent) ${Math.round(
                intensity(point.bani, minBani, maxBani) * 60
              )}%, var(--color-accent-tint-bg))`,
            }}
            title={`${point.date}: ${formatAmount(point.bani)}`}
          />
        ))}
      </div>
      {occurrences.length > 0 ? (
        <ul className={styles.ruleList}>
          {occurrences.map((occurrence, index) => (
            <li key={`${occurrence.rule.id}-${occurrence.date}-${index}`} className={styles.ruleCard} data-testid="forecast-rule-day">
              <span>{shortDate(occurrence.date)}</span>
              <span>{occurrence.rule.category ?? occurrence.rule.type}</span>
              <span className={styles.ruleAmount}>
                {formatAmount(toBani(occurrence.rule.amount) * (occurrence.rule.type === "expense" ? -1 : 1))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

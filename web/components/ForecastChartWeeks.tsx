"use client";

import { toBaniPoints, groupIntoWeeks } from "@/lib/forecast-chart-data";
import { formatAmount } from "@/lib/money";
import type { RecurringRule } from "@/lib/recurring-rules";
import styles from "./ForecastChartWeeks.module.css";

type ForecastChartWeeksProps = {
  dailyBalances: { date: string; balance: string }[];
  recurringRules: RecurringRule[];
};

function shortDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

export default function ForecastChartWeeks({ dailyBalances, recurringRules }: ForecastChartWeeksProps) {
  const points = toBaniPoints(dailyBalances);
  const buckets = groupIntoWeeks(points, recurringRules);
  const maxMagnitude = Math.max(
    1,
    ...buckets.map((bucket) => Math.max(bucket.inBani, Math.abs(bucket.outBani)))
  );

  return (
    <div className={styles.grid}>
      {buckets.map((bucket, index) => (
        <div key={index} className={styles.bucket} data-testid="forecast-week-bucket">
          {bucket.startDate && bucket.endDate ? (
            <>
              <div className={styles.range}>
                {shortDate(bucket.startDate)} – {shortDate(bucket.endDate)}
              </div>
              <div className={styles.bars}>
                <div
                  className={styles.barIn}
                  data-testid="forecast-week-bar-in"
                  style={{ height: `${(bucket.inBani / maxMagnitude) * 100}%` }}
                />
                <div
                  className={styles.barOut}
                  data-testid="forecast-week-bar-out"
                  style={{ height: `${(Math.abs(bucket.outBani) / maxMagnitude) * 100}%` }}
                />
              </div>
              <div className={styles.endBalance}>
                {bucket.endBalanceBani !== null ? formatAmount(bucket.endBalanceBani) : "—"}
              </div>
            </>
          ) : (
            <div className={styles.empty}>—</div>
          )}
        </div>
      ))}
    </div>
  );
}

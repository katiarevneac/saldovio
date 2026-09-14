import { toBani } from "./money";
import { occurrencesInWindow } from "./forecast-occurrences";
import type { RecurringRule } from "./recurring-rules";

export type DailyBalancePoint = { date: string; bani: number };

export function toBaniPoints(
  dailyBalances: { date: string; balance: string }[]
): DailyBalancePoint[] {
  return dailyBalances.map((entry) => ({ date: entry.date, bani: toBani(entry.balance) }));
}

export function findMinimum(points: DailyBalancePoint[]): DailyBalancePoint | null {
  if (points.length === 0) return null;
  let minimum = points[0];
  for (const point of points) {
    if (point.bani < minimum.bani) {
      minimum = point;
    }
  }
  return minimum;
}

export type WeekBucket = {
  startDate: string | null;
  endDate: string | null;
  inBani: number;
  outBani: number;
  endBalanceBani: number | null;
};

const WEEK_BUCKET_COUNT = 5;

// Groups a dailyBalances series (any length — real data is always 31
// points, day 0..30) into exactly 5 buckets. Bucket size is ceil(n/5) so
// the first 4 buckets are even and the 5th absorbs the remainder — for
// the real 31-point series that's 7,7,7,7,3. (The n<=7 special-case
// branch below is unchanged from before this fix.)
//
// Per-bucket inBani/outBani come from actual rule occurrences within
// that bucket's date range (via occurrencesInWindow — the same helper
// Calendar mode uses), not from day-over-day balance deltas. This
// matches the spec's own wording and avoids a blind spot the delta
// approach had: a rule landing exactly on day 0 (today) already shows
// up in dailyBalances[0]'s balance (the backend applies it before
// emitting the first point) but has no prior point to diff against, so
// a delta-based method silently drops it from the in/out breakdown
// while Calendar mode (occurrence-based) still shows it — two modes of
// one component disagreeing about the same data. Using occurrences
// directly for both keeps them consistent.
export function groupIntoWeeks(
  points: DailyBalancePoint[],
  recurringRules: RecurringRule[]
): WeekBucket[] {
  // For small series (≤ 7 days), keep all points in bucket 0. For larger series,
  // distribute evenly across all 5 buckets with ~7 days per bucket.
  const bucketSize =
    points.length <= 7 ? points.length : (Math.ceil(points.length / WEEK_BUCKET_COUNT) || 1);
  const buckets: WeekBucket[] = [];

  const calculationDate = points.length > 0 ? points[0].date : null;
  const windowEndDate = points.length > 0 ? points[points.length - 1].date : null;
  const occurrences =
    calculationDate && windowEndDate
      ? occurrencesInWindow(recurringRules, calculationDate, windowEndDate)
      : [];

  for (let bucketIndex = 0; bucketIndex < WEEK_BUCKET_COUNT; bucketIndex++) {
    const start = bucketIndex * bucketSize;
    const bucketPoints = points.slice(start, start + bucketSize);

    if (bucketPoints.length === 0) {
      buckets.push({ startDate: null, endDate: null, inBani: 0, outBani: 0, endBalanceBani: null });
      continue;
    }

    const bucketStartDate = bucketPoints[0].date;
    const bucketEndDate = bucketPoints[bucketPoints.length - 1].date;

    let inBani = 0;
    let outBani = 0;
    for (const occurrence of occurrences) {
      if (occurrence.date >= bucketStartDate && occurrence.date <= bucketEndDate) {
        const signedBani =
          toBani(occurrence.rule.amount) * (occurrence.rule.type === "expense" ? -1 : 1);
        if (signedBani > 0) inBani += signedBani;
        else if (signedBani < 0) outBani += signedBani;
      }
    }

    buckets.push({
      startDate: bucketStartDate,
      endDate: bucketEndDate,
      inBani,
      outBani,
      endBalanceBani: bucketPoints[bucketPoints.length - 1].bani,
    });
  }

  return buckets;
}

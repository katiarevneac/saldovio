import { toBani } from "./money";

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
// the real 31-point series that's 7,7,7,7,3.
//
// Per-bucket inBani/outBani come from day-over-day deltas *within the
// full series*, not from re-deriving occurrences: dailyBalances already
// encodes each day's net change (Story 8's day-by-day walk), so summing
// consecutive differences is the correct total without reimplementing
// occurrence/clamping logic a second time in TypeScript for this
// purpose. Day 0 (the series' first point) has no prior point to diff
// against — its own possible same-day occurrence is not represented as
// a separate delta anywhere in the series and is not counted here. This
// is a deliberate, narrow simplification: it only affects the displayed
// week-1 in/out breakdown, never `dailyBalances`/`forecastBalance`
// themselves, which are unaffected and remain exact.
export function groupIntoWeeks(points: DailyBalancePoint[]): WeekBucket[] {
  // For small series (≤ 7 days), keep all points in bucket 0. For larger series,
  // distribute evenly across all 5 buckets with ~7 days per bucket.
  const bucketSize =
    points.length <= 7 ? points.length : (Math.ceil(points.length / WEEK_BUCKET_COUNT) || 1);
  const buckets: WeekBucket[] = [];

  for (let bucketIndex = 0; bucketIndex < WEEK_BUCKET_COUNT; bucketIndex++) {
    const start = bucketIndex * bucketSize;
    const bucketPoints = points.slice(start, start + bucketSize);

    if (bucketPoints.length === 0) {
      buckets.push({ startDate: null, endDate: null, inBani: 0, outBani: 0, endBalanceBani: null });
      continue;
    }

    let inBani = 0;
    let outBani = 0;
    for (let i = 0; i < bucketPoints.length; i++) {
      const globalIndex = start + i;
      if (globalIndex === 0) continue; // day 0 has no prior anchor
      const delta = bucketPoints[i].bani - points[globalIndex - 1].bani;
      if (delta > 0) inBani += delta;
      else if (delta < 0) outBani += delta;
    }

    buckets.push({
      startDate: bucketPoints[0].date,
      endDate: bucketPoints[bucketPoints.length - 1].date,
      inBani,
      outBani,
      endBalanceBani: bucketPoints[bucketPoints.length - 1].bani,
    });
  }

  return buckets;
}

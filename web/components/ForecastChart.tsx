"use client";

import type { RecurringRule } from "@/lib/recurring-rules";
import type { DailyBalance } from "@/lib/analytics";
import ForecastChartLine from "./ForecastChartLine";
import ForecastChartWeeks from "./ForecastChartWeeks";
import ForecastChartCalendar from "./ForecastChartCalendar";

export type ForecastChartMode = "line" | "weeks" | "calendar";

export type ForecastChartProps = {
  mode: ForecastChartMode;
  dailyBalances: DailyBalance[];
  recurringRules: RecurringRule[];
  afterSeries?: DailyBalance[];
};

export default function ForecastChart({
  mode,
  dailyBalances,
  recurringRules,
  afterSeries,
}: ForecastChartProps) {
  if (mode === "weeks") {
    return <ForecastChartWeeks dailyBalances={dailyBalances} recurringRules={recurringRules} />;
  }
  if (mode === "calendar") {
    return <ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={recurringRules} />;
  }
  return <ForecastChartLine dailyBalances={dailyBalances} afterSeries={afterSeries} />;
}

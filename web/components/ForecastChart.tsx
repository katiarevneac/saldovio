"use client";

import type { RecurringRule } from "@/lib/recurring-rules";
import ForecastChartLine from "./ForecastChartLine";
import ForecastChartWeeks from "./ForecastChartWeeks";
import ForecastChartCalendar from "./ForecastChartCalendar";

export type ForecastChartMode = "line" | "weeks" | "calendar";

export type ForecastChartProps = {
  mode: ForecastChartMode;
  dailyBalances: { date: string; balance: string }[];
  recurringRules: RecurringRule[];
  afterSeries?: { date: string; balance: string }[];
};

export default function ForecastChart({
  mode,
  dailyBalances,
  recurringRules,
  afterSeries,
}: ForecastChartProps) {
  if (mode === "weeks") {
    return <ForecastChartWeeks dailyBalances={dailyBalances} />;
  }
  if (mode === "calendar") {
    return <ForecastChartCalendar dailyBalances={dailyBalances} recurringRules={recurringRules} />;
  }
  return <ForecastChartLine dailyBalances={dailyBalances} afterSeries={afterSeries} />;
}

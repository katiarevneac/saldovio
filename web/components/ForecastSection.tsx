"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Forecast } from "@/lib/analytics";
import type { RecurringRule } from "@/lib/recurring-rules";
import type { ForecastChartMode } from "@/components/ForecastChart";
import ForecastUnavailable from "@/components/ForecastUnavailable";
import ForecastChartSkeleton from "@/components/ForecastChartSkeleton";
import styles from "./ForecastSection.module.css";

const ForecastChart = dynamic(() => import("@/components/ForecastChart"), {
  ssr: false,
  loading: () => <ForecastChartSkeleton />,
});

const MODES: { value: ForecastChartMode; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "weeks", label: "Weeks" },
  { value: "calendar", label: "Calendar" },
];

type ForecastSectionProps = {
  forecast: Forecast | null;
  recurringRules: RecurringRule[];
};

export default function ForecastSection({ forecast, recurringRules }: ForecastSectionProps) {
  const [mode, setMode] = useState<ForecastChartMode>("line");

  if (!forecast || forecast.dailyBalances.length === 0) {
    return <ForecastUnavailable />;
  }

  return (
    <div className={styles.section}>
      <div className={styles.modeSwitcher} role="group" aria-label="Forecast view">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.modeButton}
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ForecastChart
        mode={mode}
        dailyBalances={forecast.dailyBalances}
        recurringRules={recurringRules}
      />

      <p className={styles.meta}>
        As of {forecast.calculationDate}, through {forecast.windowEndDate} (formula v
        {forecast.formulaVersion})
      </p>
      <ul className={styles.assumptions}>
        {forecast.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { RecurringRule } from "@/lib/recurring-rules";
import { simulatePurchase, type Verdict } from "@/lib/simulator";
import { toBani, formatAmount } from "@/lib/money";
import { toBaniPoints, findMinimum } from "@/lib/forecast-chart-data";
import ForecastChartSkeleton from "./ForecastChartSkeleton";
import styles from "./SimulatorPanel.module.css";

const ForecastChart = dynamic(() => import("./ForecastChart"), {
  ssr: false,
  loading: () => <ForecastChartSkeleton />,
});

type View = "side-by-side" | "deltas" | "overlaid";

const VIEWS: { value: View; label: string }[] = [
  { value: "side-by-side", label: "Side by side" },
  { value: "deltas", label: "Deltas" },
  { value: "overlaid", label: "Overlaid" },
];

const PRESETS = [
  { label: "100 RON", bani: 10000 },
  { label: "500 RON", bani: 50000 },
  { label: "1.000 RON", bani: 100000 },
  { label: "2.500 RON", bani: 250000 },
];

const VERDICT_LABEL: Record<Verdict, string> = {
  yes: "Yes — this purchase looks affordable.",
  tight: "Tight — this would leave a thin margin.",
  no: "No — this would put you below zero.",
};

type SimulatorPanelProps = {
  currentBalanceBani: number;
  recurringRules: RecurringRule[];
  initialAmountBani?: number;
  calculationDate?: string;
  windowEndDate?: string;
  essentialSpendBani?: number | null;
};

export default function SimulatorPanel({
  currentBalanceBani,
  recurringRules,
  initialAmountBani = 0,
  calculationDate,
  windowEndDate,
  essentialSpendBani,
}: SimulatorPanelProps) {
  const [amountText, setAmountText] = useState(String(Math.max(0, initialAmountBani) / 100));
  const [note, setNote] = useState("");
  const [view, setView] = useState<View>("side-by-side");

  const amountBani = useMemo(() => {
    const parsed = toBani(amountText || "0");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [amountText]);

  const sliderMaxBani = Math.max(currentBalanceBani * 2, 1000000);

  const result = useMemo(
    () =>
      simulatePurchase({
        currentBalanceBani,
        recurringRules,
        purchaseBani: amountBani,
        calculationDate,
        windowEndDate,
        essentialSpendBani,
      }),
    [
      currentBalanceBani,
      recurringRules,
      amountBani,
      calculationDate,
      windowEndDate,
      essentialSpendBani,
    ]
  );

  const baseMinimum = findMinimum(toBaniPoints(result.baseSeries));
  const baseEndBani = toBani(result.baseSeries[result.baseSeries.length - 1].balance);
  const afterEndBani = toBani(result.afterSeries[result.afterSeries.length - 1].balance);

  return (
    <div className={styles.panel}>
      <div className={styles.amountControls}>
        <label className={styles.amountLabel} htmlFor="simulator-amount">
          Purchase amount
        </label>
        <div className={styles.amountRow}>
          <span className={styles.currency}>RON</span>
          <input
            id="simulator-amount"
            type="number"
            min={0}
            step="0.01"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            className={styles.amountInput}
          />
        </div>
        <input
          type="range"
          aria-label="Purchase amount slider"
          min={0}
          max={sliderMaxBani}
          step={100}
          value={amountBani}
          onChange={(event) => setAmountText(String(Number(event.target.value) / 100))}
          className={styles.slider}
        />
        <div className={styles.chipRow} role="group" aria-label="Preset amounts">
          {PRESETS.map((preset) => (
            <button
              key={preset.bani}
              type="button"
              className={styles.chip}
              aria-pressed={amountBani === preset.bani}
              onClick={() => setAmountText(String(preset.bani / 100))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className={styles.noteLabel} htmlFor="simulator-note">
          What are you buying? (optional)
        </label>
        <input
          id="simulator-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. New laptop"
          className={styles.noteInput}
        />
      </div>

      <p className={`${styles.verdict} ${styles[`verdict-${result.verdict}`]}`}>
        {VERDICT_LABEL[result.verdict]}
      </p>
      <p className={styles.thresholdBasis}>
        {result.thresholdBasis === "essential-spend"
          ? `Based on your essential spending floor of ${formatAmount(essentialSpendBani ?? 0)}.`
          : "Based on the default 10% of your balance. Set an essential spending amount in Settings for a more precise check."}
      </p>

      <div className={styles.viewSwitcher} role="group" aria-label="Comparison view">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.viewButton}
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "side-by-side" ? (
        <div className={styles.sideBySide}>
          <div className={styles.statCard}>
            <h2 className={styles.statTitle}>Without this purchase</h2>
            <p className={styles.statRow}>
              <span>Projected balance</span>
              <span>{formatAmount(baseEndBani)}</span>
            </p>
            <p className={styles.statRow}>
              <span>Lowest projected</span>
              <span>{baseMinimum ? formatAmount(baseMinimum.bani) : "unavailable"}</span>
            </p>
          </div>
          <div className={styles.statCard}>
            <h2 className={styles.statTitle}>With this purchase</h2>
            <p className={styles.statRow}>
              <span>Projected balance</span>
              <span>{formatAmount(afterEndBani)}</span>
            </p>
            <p className={styles.statRow}>
              <span>Lowest projected</span>
              <span>{formatAmount(result.minimumAfterBani)}</span>
            </p>
          </div>
        </div>
      ) : null}

      {view === "deltas" ? (
        <table className={styles.deltaTable}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Without</th>
              <th>With</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Projected balance</td>
              <td>{formatAmount(baseEndBani)}</td>
              <td>{formatAmount(afterEndBani)}</td>
              <td className={afterEndBani - baseEndBani < 0 ? styles.diffNegative : styles.diffPositive}>
                {formatAmount(afterEndBani - baseEndBani)}
              </td>
            </tr>
            <tr>
              <td>Lowest projected</td>
              <td>{baseMinimum ? formatAmount(baseMinimum.bani) : "unavailable"}</td>
              <td>{formatAmount(result.minimumAfterBani)}</td>
              <td
                className={
                  baseMinimum && result.minimumAfterBani - baseMinimum.bani < 0
                    ? styles.diffNegative
                    : styles.diffPositive
                }
              >
                {baseMinimum
                  ? formatAmount(result.minimumAfterBani - baseMinimum.bani)
                  : "unavailable"}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {view === "overlaid" ? (
        <ForecastChart
          mode="line"
          dailyBalances={result.baseSeries}
          recurringRules={recurringRules}
          afterSeries={result.afterSeries}
        />
      ) : null}
    </div>
  );
}

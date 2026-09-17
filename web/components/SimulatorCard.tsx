"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RecurringRule } from "@/lib/recurring-rules";
import { simulatePurchase, type Verdict } from "@/lib/simulator";
import { formatAmount, toBani } from "@/lib/money";
import styles from "./SimulatorCard.module.css";

// Matches SimulatorPanel's first preset (100 RON).
const DEFAULT_AMOUNT_BANI = 10000;

const VERDICT_LABEL: Record<Verdict, string> = {
  yes: "Looks affordable.",
  tight: "Tight — thin margin left.",
  no: "Would put you below zero.",
};

type SimulatorCardProps = {
  currentBalanceBani: number;
  recurringRules: RecurringRule[];
  calculationDate?: string;
  windowEndDate?: string;
};

export default function SimulatorCard({
  currentBalanceBani,
  recurringRules,
  calculationDate,
  windowEndDate,
}: SimulatorCardProps) {
  const [amountText, setAmountText] = useState(String(DEFAULT_AMOUNT_BANI / 100));
  const sliderMaxBani = Math.max(currentBalanceBani * 2, 1000000);

  const amountBani = useMemo(() => {
    const parsed = toBani(amountText || "0");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [amountText]);

  const result = useMemo(
    () =>
      simulatePurchase({
        currentBalanceBani,
        recurringRules,
        purchaseBani: amountBani,
        calculationDate,
        windowEndDate,
      }),
    [currentBalanceBani, recurringRules, amountBani, calculationDate, windowEndDate]
  );

  const afterEndBani = toBani(result.afterSeries[result.afterSeries.length - 1].balance);

  return (
    <div className={styles.card}>
      <div className={styles.amountRow}>
        <input
          type="number"
          aria-label="Purchase amount"
          min={0}
          step="0.01"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          className={styles.amountInput}
        />
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
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Projected balance</span>
          <span className={styles.statValue}>{formatAmount(afterEndBani)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Lowest projected</span>
          <span className={styles.statValue}>{formatAmount(result.minimumAfterBani)}</span>
        </div>
      </div>

      <p className={`${styles.verdict} ${styles[`verdict-${result.verdict}`]}`}>
        {VERDICT_LABEL[result.verdict]}
      </p>

      <Link href={`/simulator?amount=${amountBani}`} className={styles.cta}>
        Open full simulator
      </Link>
    </div>
  );
}

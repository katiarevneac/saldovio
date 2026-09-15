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
};

export default function SimulatorCard({
  currentBalanceBani,
  recurringRules,
}: SimulatorCardProps) {
  const [amountBani, setAmountBani] = useState(DEFAULT_AMOUNT_BANI);
  const sliderMaxBani = Math.max(currentBalanceBani * 2, 1000000);

  const result = useMemo(
    () => simulatePurchase({ currentBalanceBani, recurringRules, purchaseBani: amountBani }),
    [currentBalanceBani, recurringRules, amountBani]
  );

  const afterEndBani = toBani(result.afterSeries[result.afterSeries.length - 1].balance);

  function handleAmountInputChange(value: string) {
    const parsed = toBani(value || "0");
    setAmountBani(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }

  return (
    <div className={styles.card}>
      <div className={styles.amountRow}>
        <input
          type="number"
          aria-label="Purchase amount"
          min={0}
          step={1}
          value={amountBani / 100}
          onChange={(event) => handleAmountInputChange(event.target.value)}
          className={styles.amountInput}
        />
        <input
          type="range"
          aria-label="Purchase amount slider"
          min={0}
          max={sliderMaxBani}
          step={100}
          value={amountBani}
          onChange={(event) => setAmountBani(Number(event.target.value))}
          className={styles.slider}
        />
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Balance in 30 days</span>
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

import type { ReactNode } from "react";
import { formatAmountValue } from "@/lib/money";
import styles from "./KpiCard.module.css";

type KpiCardProps = {
  icon: ReactNode;
  label: string;
  amountBani: number;
  caption?: string;
  variant?: "accent" | "expense";
};

export default function KpiCard({
  icon,
  label,
  amountBani,
  caption,
  variant = "accent",
}: KpiCardProps) {
  return (
    <div className={styles.card}>
      <span className={variant === "expense" ? styles.iconExpense : styles.iconAccent}>
        {icon}
      </span>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={styles.amountRow}>
          <span className={styles.currency}>RON</span>
          <span className={styles.amount}>{formatAmountValue(amountBani)}</span>
        </div>
        {caption ? <div className={styles.caption}>{caption}</div> : null}
      </div>
    </div>
  );
}

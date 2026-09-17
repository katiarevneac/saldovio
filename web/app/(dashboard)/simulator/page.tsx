import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getMySettings } from "@/lib/settings";
import { computeWindowEnd } from "@/lib/forecast-window";
import { toBani } from "@/lib/money";
import { todayDateString } from "@/lib/simulator";
import SimulatorPanel from "@/components/SimulatorPanel";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules, params] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
    searchParams,
  ]);

  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);
  const today = todayDateString();

  // Falls back to the legacy fixed 30-day window and the provisional
  // 10%-of-balance verdict rule if settings are unreachable — the simulator
  // has no separate "unavailable" state of its own, so a best-effort default
  // keeps it usable instead of broken.
  let windowEndDate = computeWindowEnd(today, null, 30);
  let essentialSpendBani: number | null = null;
  try {
    const settings = await getMySettings();
    windowEndDate = computeWindowEnd(today, settings.payday, settings.horizon_days);
    essentialSpendBani =
      settings.essential_spend === null ? null : toBani(settings.essential_spend);
  } catch {
    // keep the defaults computed above
  }

  // ?amount= carries a raw bani integer (set by Overview's CTA link), not a
  // decimal RON string — an internal link, not user-typed input, so no
  // decimal-string parsing is needed here.
  const parsedAmount = params.amount ? Number(params.amount) : NaN;
  const initialAmountBani =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Can I afford it?</h1>
        <p className={styles.heroSub}>
          See how a purchase today changes your forecast.
        </p>
      </div>

      <section className={styles.card}>
        <SimulatorPanel
          currentBalanceBani={totalBani}
          recurringRules={recurringRules}
          initialAmountBani={initialAmountBani}
          calculationDate={today}
          windowEndDate={windowEndDate}
          essentialSpendBani={essentialSpendBani}
        />
      </section>
    </div>
  );
}

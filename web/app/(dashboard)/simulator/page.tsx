import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { toBani } from "@/lib/money";
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
          See how a purchase today changes your 30-day forecast.
        </p>
      </div>

      <section className={styles.card}>
        <SimulatorPanel
          currentBalanceBani={totalBani}
          recurringRules={recurringRules}
          initialAmountBani={initialAmountBani}
        />
      </section>
    </div>
  );
}

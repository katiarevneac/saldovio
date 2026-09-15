import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getTransactions } from "@/lib/transactions";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString, formatAmount } from "@/lib/money";
import { computeMonthlyTotals, currentYearMonth } from "@/lib/overview-metrics";
import { todayDateString } from "@/lib/simulator";
import { getMySettings } from "@/lib/settings";
import { computeWindowEnd } from "@/lib/forecast-window";
import KpiCard from "@/components/KpiCard";
import AddTransactionModal from "@/components/AddTransactionModal";
import ForecastSection from "@/components/ForecastSection";
import SimulatorCard from "@/components/SimulatorCard";
import { auth } from "@/auth";
import styles from "./page.module.css";

function WalletIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

function TrendingDownIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules, transactions] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
    getTransactions(),
  ]);

  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);
  const monthly = computeMonthlyTotals(transactions, currentYearMonth());

  let forecast: Forecast | null = null;
  try {
    const settings = await getMySettings();
    const windowEndDate = computeWindowEnd(todayDateString(), settings.payday, settings.horizon_days);
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules, windowEndDate);
  } catch {
    forecast = null;
  }

  const recentTransactions = [...transactions]
    .sort((a, b) =>
      a.occurred_on === b.occurred_on
        ? b.id - a.id
        : a.occurred_on < b.occurred_on
          ? 1
          : -1
    )
    .slice(0, 5);

  const condensedAccounts = accounts.slice(0, 3);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Your money, in perspective.</h1>
          <p className={styles.heroSub}>A clearer view of today. A plan for tomorrow.</p>
        </div>
        <AddTransactionModal accounts={accounts} />
      </div>

      <div className={styles.kpiGrid}>
        <KpiCard
          icon={<WalletIcon />}
          label="Total balance"
          amountBani={totalBani}
          caption={`Sum of ${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          icon={<TrendingUpIcon />}
          label="Income this month"
          amountBani={monthly.incomeBani}
          caption="Confirmed transactions this month."
        />
        <KpiCard
          icon={<TrendingDownIcon />}
          label="Expenses this month"
          amountBani={Math.abs(monthly.expenseBani)}
          caption="Confirmed transactions this month."
          variant="expense"
        />
        <KpiCard
          icon={<BarChartIcon />}
          label="Monthly surplus"
          amountBani={monthly.surplusBani}
          caption="Confirmed income minus spending."
        />
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Recurring rules</h2>
          <Link href="/recurring-rules/new" className={styles.cardLink}>
            Add recurring rule
          </Link>
        </div>
        {recurringRules.length === 0 ? (
          <p className={styles.emptyState}>No recurring rules yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {recurringRules.map((rule) => (
              <li key={rule.id} className={styles.condensedRow}>
                <span>
                  {rule.category ?? rule.type} — day {rule.day_of_month}
                </span>
                <span className={styles.tabularNums}>
                  {formatAmount(toBani(rule.amount) * (rule.type === "expense" ? -1 : 1))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Accounts</h2>
          <Link href="/accounts" className={styles.cardLink}>
            View all accounts
          </Link>
        </div>
        {condensedAccounts.length === 0 ? (
          <p className={styles.emptyState}>No accounts yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {condensedAccounts.map((account) => (
              <li key={account.id} className={styles.condensedRow}>
                <span>{account.name}</span>
                <span className={styles.tabularNums}>{formatAmount(toBani(account.balance))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Recent transactions</h2>
          <Link href="/transactions" className={styles.cardLink}>
            View all transactions
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <p className={styles.emptyState}>No transactions yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {recentTransactions.map((transaction) => (
              <li key={transaction.id} className={styles.condensedRow}>
                <span>
                  {transaction.occurred_on} — {transaction.category ?? transaction.type}
                </span>
                <span className={styles.tabularNums}>{formatAmount(toBani(transaction.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Forecast</h2>
        {forecast && forecast.dailyBalances.length > 0 ? (
          <p className={styles.forecastHeadline}>
            {formatAmount(toBani(forecast.forecastBalance))}
          </p>
        ) : null}
        <ForecastSection forecast={forecast} recurringRules={recurringRules} />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Simulator</h2>
        <SimulatorCard
          currentBalanceBani={totalBani}
          recurringRules={recurringRules}
          calculationDate={todayDateString()}
        />
      </section>
    </div>
  );
}

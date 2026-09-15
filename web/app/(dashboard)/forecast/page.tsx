import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString } from "@/lib/money";
import { toBaniPoints, findMinimum } from "@/lib/forecast-chart-data";
import { getMySettings } from "@/lib/settings";
import { computeWindowEnd } from "@/lib/forecast-window";
import { todayDateString } from "@/lib/simulator";
import ForecastSection from "@/components/ForecastSection";
import KpiCard from "@/components/KpiCard";
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

function BarChartIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function TrendingDownIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 17h6v-6" />
      <path d="m22 17-8.5-8.5-5 5L2 7" />
    </svg>
  );
}

export default async function ForecastPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules, settings] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
    getMySettings(),
  ]);

  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);

  let forecast: Forecast | null = null;
  try {
    const windowEndDate = computeWindowEnd(todayDateString(), settings.payday, settings.horizon_days);
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules, windowEndDate);
  } catch {
    forecast = null;
  }

  const points = forecast ? toBaniPoints(forecast.dailyBalances) : [];
  const minimum = findMinimum(points);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Forecast</h1>
        <p className={styles.heroSub}>Your projected balance over the next 30 days.</p>
      </div>

      {forecast && forecast.dailyBalances.length > 0 ? (
        <div className={styles.kpiGrid}>
          <KpiCard
            icon={<WalletIcon />}
            label="Current balance"
            amountBani={totalBani}
            caption={`As of ${forecast.calculationDate}`}
          />
          <KpiCard
            icon={<BarChartIcon />}
            label="Balance in 30 days"
            amountBani={toBani(forecast.forecastBalance)}
            caption={`Projected for ${forecast.windowEndDate}`}
          />
          <KpiCard
            icon={<TrendingDownIcon />}
            label="Lowest projected"
            amountBani={minimum ? minimum.bani : toBani(forecast.forecastBalance)}
            caption={minimum ? `On ${minimum.date}` : "unavailable"}
            variant="expense"
          />
        </div>
      ) : null}

      <section className={styles.card}>
        <ForecastSection forecast={forecast} recurringRules={recurringRules} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString, formatAmount } from "@/lib/money";
import TransactionForm from "@/components/TransactionForm";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
  ]);
  const totalBani = accounts.reduce(
    (sum, account) => sum + toBani(account.balance),
    0
  );

  let forecast: Forecast | null = null;
  let forecastError = false;
  try {
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules);
  } catch {
    forecastError = true;
  }

  return (
    <div className={styles.page}>
      <section>
        <h2>Current balance</h2>
        <p className={styles.balance}>{formatAmount(totalBani)}</p>
      </section>

      <section>
        <h2>Accounts</h2>
        <Link href="/accounts">View all accounts</Link>
      </section>

      <section>
        <h2>Recurring rules</h2>
        <ul className={styles.accountList}>
          {recurringRules.map((rule) => (
            <li key={rule.id}>
              {rule.category ?? rule.type} — day {rule.day_of_month} —{" "}
              {formatAmount(
                toBani(rule.amount) * (rule.type === "expense" ? -1 : 1)
              )}
            </li>
          ))}
        </ul>
        <Link href="/recurring-rules/new">Add recurring rule</Link>
      </section>

      <section>
        <h2>30-day forecast</h2>
        {forecast ? (
          <>
            <p className={styles.balance}>
              {formatAmount(toBani(forecast.forecastBalance))}
            </p>
            <p className={styles.forecastMeta}>
              As of {forecast.calculationDate}, through{" "}
              {forecast.windowEndDate} (formula v{forecast.formulaVersion})
            </p>
            <ul className={styles.forecastAssumptions}>
              {forecast.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </>
        ) : forecastError ? (
          <p className={styles.error}>
            Forecast unavailable right now — Analytics Service could not be
            reached. Your balance and transactions above are unaffected.
          </p>
        ) : null}
      </section>

      <section>
        <h2>Add transaction</h2>
        <TransactionForm accounts={accounts} />
      </section>

      <section>
        <h2>Transactions</h2>
        <Link href="/transactions">View all transactions</Link>
      </section>
    </div>
  );
}

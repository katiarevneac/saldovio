import Link from "next/link";
import { redirect } from "next/navigation";
import { getTransactions } from "@/lib/transactions";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString, formatAmount } from "@/lib/money";
import TransactionForm from "@/components/TransactionForm";
import { auth, signOut } from "@/auth";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, transactions, recurringRules] = await Promise.all([
    getMyAccounts(),
    getTransactions(),
    getMyRecurringRules(),
  ]);
  const totalBani = accounts.reduce(
    (sum, account) => sum + toBani(account.balance),
    0
  );

  // Analytics Service is a separate, independently-deployable
  // component — it going down must never affect the core dashboard,
  // and an unavailable forecast must never silently render as zero
  // (CLAUDE.md). Caught locally, not left to crash the whole page.
  let forecast: Forecast | null = null;
  let forecastError = false;
  try {
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules);
  } catch {
    forecastError = true;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Saldovio</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <span className={styles.sessionEmail}>{session.user.email}</span>
          <button type="submit">Log out</button>
        </form>
      </header>

      <main>
        <section>
          <h2>Current balance</h2>
          <p className={styles.balance}>{formatAmount(totalBani)}</p>
        </section>

        <section>
          <h2>Accounts</h2>
          <ul className={styles.accountList}>
            {accounts.map((account) => (
              <li key={account.id}>
                {account.name}: {formatAmount(toBani(account.balance))}
              </li>
            ))}
          </ul>
          <Link href="/accounts/new">Add account</Link>
        </section>

        <section>
          <h2>Recurring rules</h2>
          <ul className={styles.accountList}>
            {recurringRules.map((rule) => (
              <li key={rule.id}>
                {rule.category ?? rule.type} — day {rule.day_of_month} —{" "}
                {formatAmount(
                  toBani(rule.amount) *
                    (rule.type === "expense" ? -1 : 1)
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
              Forecast unavailable right now — Analytics Service could not
              be reached. Your balance and transactions above are
              unaffected.
            </p>
          ) : null}
        </section>

        <section>
          <h2>Add transaction</h2>
          <TransactionForm accounts={accounts} />
        </section>

        <section>
          <h2>Transactions</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const bani = toBani(t.amount);
                return (
                  <tr key={t.id}>
                    <td>{t.occurred_on}</td>
                    <td>{t.category ?? ""}</td>
                    <td className={bani < 0 ? styles.expense : styles.income}>
                      {formatAmount(bani)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

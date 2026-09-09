import Link from "next/link";
import { getTransactions } from "@/lib/transactions";
import { getMyAccounts } from "@/lib/accounts";
import { toBani, formatAmount } from "@/lib/money";
import TransactionForm from "@/components/TransactionForm";
import { auth, signOut } from "@/auth";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const session = await auth();
  const [accounts, transactions] = await Promise.all([
    getMyAccounts(),
    getTransactions(),
  ]);
  const totalBani = accounts.reduce(
    (sum, account) => sum + toBani(account.balance),
    0
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Saldovio</h1>
        {session?.user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <span className={styles.sessionEmail}>{session.user.email}</span>
            <button type="submit">Log out</button>
          </form>
        ) : (
          <a href="/login">Log in</a>
        )}
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

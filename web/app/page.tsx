import { getTransactions } from "@/lib/transactions";
import { toBani, formatAmount } from "@/lib/money";
import TransactionForm from "@/components/TransactionForm";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const transactions = await getTransactions();
  const totalBani = transactions.reduce((sum, t) => sum + toBani(t.amount), 0);

  return (
    <div className={styles.page}>
      <header>
        <h1>Saldovio</h1>
      </header>

      <main>
        <section>
          <h2>Current balance</h2>
          <p className={styles.balance}>{formatAmount(totalBani)}</p>
        </section>

        <section>
          <h2>Add transaction</h2>
          <TransactionForm />
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

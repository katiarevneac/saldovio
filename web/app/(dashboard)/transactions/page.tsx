import { redirect } from "next/navigation";
import { getTransactions } from "@/lib/transactions";
import { toBani, formatAmount } from "@/lib/money";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const transactions = await getTransactions();

  return (
    <div>
      <h1>Transactions</h1>
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
    </div>
  );
}

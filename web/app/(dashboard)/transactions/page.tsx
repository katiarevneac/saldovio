import { redirect } from "next/navigation";
import { getTransactions } from "@/lib/transactions";
import { getMyAccounts } from "@/lib/accounts";
import { auth } from "@/auth";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsExplorer from "@/components/TransactionsExplorer";
import styles from "./page.module.css";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [transactions, accounts] = await Promise.all([
    getTransactions(),
    getMyAccounts(),
  ]);

  const accountNameById = Object.fromEntries(
    accounts.map((account) => [account.id, account.name])
  );
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Transactions</h1>
          <p className={styles.heroSub}>
            {transactions.length} transaction{transactions.length === 1 ? "" : "s"} · {monthLabel}
          </p>
        </div>
        <AddTransactionModal accounts={accounts} />
      </div>

      <TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />
    </div>
  );
}

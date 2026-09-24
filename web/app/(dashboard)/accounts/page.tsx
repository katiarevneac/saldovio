import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { toBani, formatAmount } from "@/lib/money";
import { computePercentOfTotal, formatPercent } from "@/lib/account-metrics";
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

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const accounts = await getMyAccounts();
  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Accounts</h1>
          <p className={styles.heroSub}>
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/accounts/new" className={styles.addButton}>
          + Add account
        </Link>
      </div>

      <KpiCard
        icon={<WalletIcon />}
        label="Total balance"
        amountBani={totalBani}
        caption={`Sum of ${accounts.length} account${accounts.length === 1 ? "" : "s"}, each balance already reflects its own reference date.`}
      />

      {accounts.length === 0 ? (
        <p className={styles.emptyState}>No accounts yet.</p>
      ) : (
        <div className={styles.accountsGrid}>
          {accounts.map((account) => {
            const accountBani = toBani(account.balance);
            const percent = computePercentOfTotal(accountBani, totalBani);
            return (
              <div key={account.id} className={styles.accountCard}>
                <div className={styles.accountName}>{account.name}</div>
                <div className={styles.accountBalance}>{formatAmount(accountBani)}</div>
                <div className={styles.accountMeta}>
                  <span>Reference date: {account.reference_date}</span>
                  <span>{formatPercent(percent)}</span>
                </div>
                {!account.configured && (
                  <Link href={`/accounts/${account.id}/edit`} className={styles.completeSetupLink}>
                    Complete setup
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

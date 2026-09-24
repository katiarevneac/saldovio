import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { toBani, formatAmount } from "@/lib/money";
import { computePercentOfTotal, formatPercent } from "@/lib/account-metrics";
import KpiCard from "@/components/KpiCard";
import { auth } from "@/auth";
import { updateAccountFlagsAction } from "@/app/actions";
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
  // S03.6: archived accounts still count toward the total (must not
  // silently erase money/history from consolidated reporting) — only the
  // main grid excludes them, they move to their own section below.
  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const archivedAccounts = accounts.filter((account) => account.archived);

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

      {visibleAccounts.length === 0 && archivedAccounts.length === 0 ? (
        <p className={styles.emptyState}>No accounts yet.</p>
      ) : (
        <div className={styles.accountsGrid} data-testid="accounts-grid">
          {visibleAccounts.map((account) => {
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
                {account.protectedSavings && (
                  <span className={styles.badge}>Protected savings</span>
                )}
                {!account.configured ? (
                  <Link href={`/accounts/${account.id}/edit`} className={styles.completeSetupLink}>
                    Complete setup
                  </Link>
                ) : (
                  <Link href={`/accounts/${account.id}/edit`} className={styles.correctBalanceLink}>
                    Correct balance
                  </Link>
                )}
                <div className={styles.cardActions}>
                  <form
                    action={updateAccountFlagsAction.bind(null, account.id, {
                      protectedSavings: !account.protectedSavings,
                    })}
                  >
                    <button type="submit" className={styles.flagButton}>
                      {account.protectedSavings ? "Unmark protected savings" : "Mark protected savings"}
                    </button>
                  </form>
                  <form
                    action={updateAccountFlagsAction.bind(null, account.id, { archived: true })}
                  >
                    <button type="submit" className={styles.flagButton}>
                      Archive
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archivedAccounts.length > 0 && (
        <div data-testid="archived-accounts">
          <h2 className={styles.archivedTitle}>Archived</h2>
          <div className={styles.accountsGrid}>
            {archivedAccounts.map((account) => {
              const accountBani = toBani(account.balance);
              return (
                <div key={account.id} className={styles.accountCard}>
                  <div className={styles.accountName}>{account.name}</div>
                  <div className={styles.accountBalance}>{formatAmount(accountBani)}</div>
                  <div className={styles.accountMeta}>
                    <span>Reference date: {account.reference_date}</span>
                  </div>
                  <div className={styles.cardActions}>
                    <form
                      action={updateAccountFlagsAction.bind(null, account.id, { archived: false })}
                    >
                      <button type="submit" className={styles.flagButton}>
                        Unarchive
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getTransactions } from "@/lib/transactions";
import { toBani } from "@/lib/money";
import { todayDateString } from "@/lib/simulator";
import { auth } from "@/auth";
import AccountCorrectionForm from "@/components/AccountCorrectionForm";
import styles from "./page.module.css";

export default async function EditAccountPage(props: PageProps<"/accounts/[id]/edit">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await props.params;
  const accountId = Number(id);

  const [accounts, transactions] = await Promise.all([
    getMyAccounts(),
    getTransactions(),
  ]);
  const account = accounts.find((a) => a.id === accountId);

  // Nothing to show: the account doesn't exist, or isn't the caller's —
  // getMyAccounts is already owner-scoped.
  if (!account) {
    redirect("/accounts");
  }

  const searchParams = await props.searchParams;
  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;

  const accountTransactions = transactions
    .filter((t) => t.account_id === accountId)
    .map((t) => ({ occurredOn: t.occurred_on, amountBani: toBani(t.amount) }));

  return (
    <div className={styles.page}>
      <h1>{account.configured ? "Correct account balance" : "Complete account setup"}</h1>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      <AccountCorrectionForm
        accountId={accountId}
        name={account.name}
        currentBalance={account.current_balance}
        referenceDate={account.reference_date}
        openingBoundary={account.opening_boundary}
        transactions={accountTransactions}
        today={todayDateString()}
      />

      <p>
        <Link href="/accounts">Back to accounts</Link>
      </p>
    </div>
  );
}

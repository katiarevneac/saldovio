import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { toBani, formatAmount } from "@/lib/money";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const accounts = await getMyAccounts();

  return (
    <div>
      <h1>Accounts</h1>
      <ul className={styles.list}>
        {accounts.map((account) => (
          <li key={account.id}>
            {account.name}: {formatAmount(toBani(account.balance))}
          </li>
        ))}
      </ul>
      <Link href="/accounts/new">Add account</Link>
    </div>
  );
}

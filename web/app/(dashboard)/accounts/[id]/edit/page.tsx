import Link from "next/link";
import { redirect } from "next/navigation";
import { updateAccountAction } from "@/app/actions";
import { getMyAccounts } from "@/lib/accounts";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function EditAccountPage(props: PageProps<"/accounts/[id]/edit">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await props.params;
  const accountId = Number(id);

  const accounts = await getMyAccounts();
  const account = accounts.find((a) => a.id === accountId);

  // Nothing to complete: the account doesn't exist (or isn't the
  // caller's — getMyAccounts is already owner-scoped) or is already
  // configured. Direct navigation is the only way to reach this state,
  // since the "Complete setup" link only ever points at an unconfigured
  // account of the caller's own.
  if (!account || account.configured) {
    redirect("/accounts");
  }

  const searchParams = await props.searchParams;
  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <div className={styles.page}>
      <h1>Complete account setup</h1>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      <form
        className={styles.form}
        action={updateAccountAction.bind(null, accountId)}
      >
        <div className={styles.field}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={account.name} required />
        </div>

        <div className={styles.field}>
          <label htmlFor="currentBalance">Starting balance</label>
          <input
            id="currentBalance"
            name="currentBalance"
            type="number"
            step="0.01"
            defaultValue={account.current_balance}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="referenceDate">As of date</label>
          <input
            id="referenceDate"
            name="referenceDate"
            type="date"
            defaultValue={account.reference_date}
            required
          />
        </div>

        <button type="submit">Save</button>
      </form>

      <p>
        <Link href="/accounts">Back to accounts</Link>
      </p>
    </div>
  );
}

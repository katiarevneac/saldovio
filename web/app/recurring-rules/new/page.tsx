import Link from "next/link";
import { createRecurringRuleAction } from "@/app/actions";
import { getMyAccounts } from "@/lib/accounts";
import styles from "./page.module.css";

export default async function NewRecurringRulePage(
  props: PageProps<"/recurring-rules/new">
) {
  const [searchParams, accounts] = await Promise.all([
    props.searchParams,
    getMyAccounts(),
  ]);
  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <div className={styles.page}>
      <h1>Add recurring rule</h1>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      <form className={styles.form} action={createRecurringRuleAction}>
        <div className={styles.field}>
          <label htmlFor="accountId">Account</label>
          <select id="accountId" name="accountId" required>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="type">Type</label>
          <select id="type" name="type" required defaultValue="expense">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="dayOfMonth">Day of month</label>
          <input
            id="dayOfMonth"
            name="dayOfMonth"
            type="number"
            min="1"
            max="31"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="category">Category</label>
          <input id="category" name="category" type="text" />
        </div>

        <button type="submit">Create recurring rule</button>
      </form>

      <p>
        <Link href="/">Back to dashboard</Link>
      </p>
    </div>
  );
}

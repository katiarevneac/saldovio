import Link from "next/link";
import { redirect } from "next/navigation";
import { createAccountAction } from "@/app/actions";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function NewAccountPage(props: PageProps<"/accounts/new">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <div className={styles.page}>
      <h1>Add account</h1>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      <form className={styles.form} action={createAccountAction}>
        <div className={styles.field}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required />
        </div>

        <div className={styles.field}>
          <label htmlFor="currentBalance">Starting balance</label>
          <input
            id="currentBalance"
            name="currentBalance"
            type="number"
            step="0.01"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="referenceDate">As of date</label>
          <input
            id="referenceDate"
            name="referenceDate"
            type="date"
            required
          />
        </div>

        <button type="submit">Create account</button>
      </form>

      <p>
        <Link href="/">Back to dashboard</Link>
      </p>
    </div>
  );
}

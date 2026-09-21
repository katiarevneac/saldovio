import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMySettings } from "@/lib/settings";
import { getMyAccounts } from "@/lib/accounts";
import { updateSettingsAction, deleteAccountAction } from "@/app/actions";
import ImportCsvModal from "@/components/ImportCsvModal";
import styles from "./page.module.css";

export default async function SettingsPage(props: PageProps<"/settings">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [settings, accounts, searchParams] = await Promise.all([
    getMySettings(),
    getMyAccounts(),
    props.searchParams,
  ]);

  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;
  const saved = searchParams.saved === "1";
  const deleteErrorMessage =
    typeof searchParams.deleteError === "string" ? searchParams.deleteError : null;

  return (
    <div className={styles.page}>
      <h1>Settings</h1>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Profile</h2>
        <p className={styles.profileRow}>
          <span className={styles.profileLabel}>Email</span>
          <span>{session.user.email}</span>
        </p>
        <p className={styles.note}>Saldovio supports RON only for now.</p>
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Forecast assumptions</h2>

        {saved && <p className={styles.success}>Settings saved.</p>}
        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <form className={styles.form} action={updateSettingsAction}>
          <div className={styles.field}>
            <label htmlFor="essentialSpend">Essential spend (RON, optional)</label>
            <input
              id="essentialSpend"
              name="essentialSpend"
              type="number"
              min={0}
              step="0.01"
              defaultValue={settings.essential_spend ?? ""}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="payday">Payday (day of month, optional)</label>
            <input
              id="payday"
              name="payday"
              type="number"
              min={1}
              max={31}
              defaultValue={settings.payday ?? ""}
            />
            <p className={styles.hint}>
              When set, the forecast and simulator windows run to your next
              payday instead of a fixed number of days.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="horizonDays">Forecast horizon (days)</label>
            <input
              id="horizonDays"
              name="horizonDays"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.horizon_days}
              required
            />
            <p className={styles.hint}>Used only when no payday is set.</p>
          </div>

          <button type="submit">Save settings</button>
        </form>
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Data</h2>

        <div className={styles.dataActions}>
          <a href="/api/export" className={styles.exportButton}>
            Export CSV
          </a>
          <ImportCsvModal accounts={accounts} />
        </div>

        <div className={styles.deleteSection}>
          <h3 className={styles.deleteTitle}>Delete account</h3>
          <p className={styles.deleteWarning}>
            This permanently deletes your account and all its data. This
            cannot be undone.
          </p>

          {deleteErrorMessage && <p className={styles.error}>{deleteErrorMessage}</p>}

          <form className={styles.deleteForm} action={deleteAccountAction}>
            <div className={styles.field}>
              <label htmlFor="password">Current password</label>
              <input id="password" name="password" type="password" required />
            </div>
            <button type="submit" className={styles.deleteButton}>
              Delete account permanently
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

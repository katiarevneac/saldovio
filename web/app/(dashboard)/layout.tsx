import Sidebar from "@/components/Sidebar";
import { auth, signOut } from "@/auth";
import styles from "./layout.module.css";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.brand}>Saldovio</p>
          {session?.user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <span className={styles.sessionEmail}>
                {session.user.email}
              </span>
              <button type="submit">Log out</button>
            </form>
          ) : null}
        </header>

        {children}
      </main>
    </div>
  );
}

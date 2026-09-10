import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { LoginSchema } from "@/lib/schemas/auth";
import styles from "./page.module.css";

const SIGNIN_ERROR_URL = "/login";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const hasError = typeof searchParams.error === "string";

  return (
    <div className={styles.page}>
      <h1>Log in</h1>

      {hasError && <p className={styles.error}>Invalid email or password.</p>}

      <form
        className={styles.form}
        action={async (formData) => {
          "use server";

          const parsed = LoginSchema.safeParse({
            email: formData.get("email"),
            password: formData.get("password"),
          });
          if (!parsed.success) {
            const message = parsed.error.issues.map((issue) => issue.message).join(", ");
            return redirect(`${SIGNIN_ERROR_URL}?error=${encodeURIComponent(message)}`);
          }

          try {
            await signIn("credentials", {
              email: parsed.data.email,
              password: parsed.data.password,
              redirectTo: "/",
            });
          } catch (error) {
            if (error instanceof AuthError) {
              return redirect(`${SIGNIN_ERROR_URL}?error=${error.type}`);
            }
            throw error;
          }
        }}
      >
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
        </div>

        <button type="submit">Log in</button>
      </form>

      <p>
        No account? <a href="/signup">Sign up</a>
      </p>
    </div>
  );
}

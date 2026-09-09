import { redirect } from "next/navigation";
import { FINANCE_API_URL } from "@/lib/config";
import styles from "./page.module.css";

async function signupAction(formData: FormData) {
  "use server";

  const response = await fetch(`${FINANCE_API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: formData.get("email"),
      password: formData.get("password"),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? "Signup failed");
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  redirect("/login");
}

export default async function SignupPage(props: PageProps<"/signup">) {
  const searchParams = await props.searchParams;
  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <div className={styles.page}>
      <h1>Sign up</h1>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      <form className={styles.form} action={signupAction}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
          />
        </div>

        <button type="submit">Sign up</button>
      </form>

      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </div>
  );
}

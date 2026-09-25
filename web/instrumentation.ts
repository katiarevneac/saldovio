export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/validate-env");
    validateEnv(process.env, [
      "AUTH_SECRET",
      "INTERNAL_API_SECRET",
      "ANALYTICS_API_SECRET",
    ]);
  }
}

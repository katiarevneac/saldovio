export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/validate-env");
    try {
      validateEnv(process.env, [
        "AUTH_SECRET",
        "INTERNAL_API_SECRET",
        "ANALYTICS_API_SECRET",
      ]);
    } catch (error) {
      // A thrown error here is caught by Next.js's own unhandledRejection
      // handler, which logs "Failed to prepare server" but leaves the
      // process running, serving 500s to every request instead of
      // actually failing to start (final review finding, Epic 15
      // Story 1). The spec's S04.1 section requires fail-fast: non-zero
      // exit before the server binds a port. Log only the error message
      // (never secret values, matching the existing rule) and exit.
      console.error(
        "[startup] " + (error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  }
}

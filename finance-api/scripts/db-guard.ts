// Shared by seed-test.ts and seed-demo.ts. Same floor as
// test/setup-db-guard.ts's vitest guard, applied to standalone scripts
// instead of the test runner: a name-suffix check alone isn't real
// isolation, but it stops the common accident of a seed script writing
// into saldovio_dev or a personal database because an env file wasn't
// swapped.
export function assertDatabaseUrlSuffix(databaseUrl: string | undefined, suffix: string): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  let databaseName: string;
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${databaseUrl}`);
  }

  if (!databaseName.endsWith(suffix)) {
    throw new Error(
      `Refusing to run against database "${databaseName}" — its name does not end in ` +
        `"${suffix}". Point DATABASE_URL at a database named *${suffix}.`,
    );
  }

  return databaseUrl;
}

export function validateEnv(
  env: Record<string, string | undefined>,
  requiredKeys: string[],
): void {
  const missing = requiredKeys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }
}

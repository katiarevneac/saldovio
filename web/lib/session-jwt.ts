import { fetchSessionVersion, type SessionVersionResult } from "./session-version";

// Pure decision function — no I/O, fully covered by direct unit tests.
// Kept separate from handleJwtCallback below specifically so the
// mismatch/not-found/unavailable branching can be tested without mocking
// fetch or the internal-auth signer.
export function resolveSessionVersion(
  tokenVersion: number,
  result: SessionVersionResult
): number | null {
  if (result.status === "not-found") return null;
  if (result.status === "unavailable") return tokenVersion;
  if (result.version !== tokenVersion) return null;
  return result.version;
}

type SessionToken = { id: string; sessionVersion: number };

// Orchestrates the actual DB check (fetchSessionVersion) with the pure
// decision above. Called from web/auth.ts's jwt() callback, which Auth.js
// (v5) invokes unconditionally on every request under the JWT session
// strategy (confirmed against next-auth's own session-handling source via
// context7 during planning) — returning null here is Auth.js's documented
// signal to drop the session (its own cookie-clearing behavior on a null
// jwt() result).
export async function handleJwtCallback(
  token: { id?: string; sessionVersion?: number },
  user: SessionToken | undefined
): Promise<SessionToken | null> {
  if (user) {
    return { id: user.id, sessionVersion: user.sessionVersion };
  }

  if (!token.id || typeof token.sessionVersion !== "number") {
    return null;
  }

  const result = await fetchSessionVersion(token.id);
  const resolvedVersion = resolveSessionVersion(token.sessionVersion, result);
  if (resolvedVersion === null) {
    return null;
  }

  return { id: token.id, sessionVersion: resolvedVersion };
}

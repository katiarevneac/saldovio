import "server-only";
import { FINANCE_API_URL } from "./config";
import { signInternalToken } from "./internal-auth";

export type SessionVersionResult =
  | { status: "current"; version: number }
  | { status: "not-found" }
  | { status: "unavailable" };

// Deliberate fail-open/fail-closed split (Epic 15 Story 2 design decision,
// made during planning — not in the spec verbatim): a 404 means the user
// row itself is gone (deleted account, or a since-rotated fixture in
// tests) — that's an authoritative "this session must end," so it
// invalidates. Any other failure (network error, 5xx, the internal token
// itself failing to sign) means we simply don't know the current version
// — treated as "unavailable," which session-jwt.ts's resolveSessionVersion
// keeps the existing session alive for, rather than logging out every
// active user during a Finance API hiccup. This trades a theoretically
// tighter revocation guarantee for availability, consistent with this
// project's documented "single free-tier instance, no distributed state"
// posture (see the spec's rate-limiting decision for the same tradeoff
// made explicitly elsewhere).
export async function fetchSessionVersion(userId: string): Promise<SessionVersionResult> {
  let token: string;
  try {
    token = await signInternalToken(userId);
  } catch {
    return { status: "unavailable" };
  }

  let response: Response;
  try {
    response = await fetch(`${FINANCE_API_URL}/users/me/session-version`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 404) {
    return { status: "not-found" };
  }
  if (!response.ok) {
    return { status: "unavailable" };
  }

  const body = await response.json();
  return { status: "current", version: body.session_version };
}

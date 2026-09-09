import "server-only";
import { SignJWT } from "jose";
import { auth } from "@/auth";

// This module signs the internal, short-lived JWT that proves a
// request to Finance API really comes from web/'s server, acting on
// behalf of the currently logged-in user. `import "server-only"` makes
// the build fail if this ever gets imported into a Client Component —
// INTERNAL_API_SECRET must never reach the browser bundle.
const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);

async function signInternalToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(secret);
}

export async function getAuthorizedHeaders(): Promise<HeadersInit> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const token = await signInternalToken(session.user.id);
  return { Authorization: `Bearer ${token}` };
}

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// jsdom's global TextEncoder.encode() returns a Uint8Array from a
// different realm than jose's — jose's `key instanceof Uint8Array`
// check (node_modules/jose/dist/webapi/lib/key.js) then rejects it,
// even though `arr.constructor.name` reads "Uint8Array" on both sides
// (confirmed by direct repro: a plain `new Uint8Array(...)` built in
// this file's own scope passes jose's check; the same file's
// `new TextEncoder().encode(...)` output does not — see also
// vitest.setup.ts's existing jsdom-quirk polyfills, e.g. for
// HTMLDialogElement/ResizeObserver, for the same class of issue).
// internal-auth.ts's real signInternalToken calls TextEncoder().encode()
// at module scope, so it hits this for real — not test-only. Rather than
// touch production code (out of scope for this task) or switch this file
// to the "node" environment (breaks vitest.setup.ts's unconditional
// HTMLDialogElement reference, shared by every other spec), this stub
// swaps in a TextEncoder whose output is built via `new Uint8Array(...)`
// in this module's own realm — the one jose actually accepts — while
// still producing correct UTF-8 bytes via Buffer.
class RealmSafeTextEncoder {
  encode(input = ""): Uint8Array {
    return new Uint8Array(Buffer.from(input, "utf-8"));
  }
}

// internal-auth.ts imports "@/auth" unconditionally at module scope (for
// getAuthorizedHeaders), which transitively pulls in next-auth's
// extensionless "next/server" import — a resolution failure under
// Vitest even when only signInternalToken is under test (see
// proxy.spec.ts's comment on the same issue). Mocked here, hoisted, so
// every import of "./internal-auth" in this file succeeds; matches the
// vi.hoisted + top-level vi.mock("@/auth", ...) shape already used by
// web/app/(dashboard)/settings/page.spec.tsx.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

describe("signInternalToken", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
    vi.stubGlobal("TextEncoder", RealmSafeTextEncoder);
  });

  it("signs a token with the expected subject, issuer, and audience", async () => {
    const { jwtVerify } = await import("jose");
    const { signInternalToken } = await import("./internal-auth");

    const token = await signInternalToken("42");
    const secret = new TextEncoder().encode("test-internal-secret");
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "saldovio-web",
      audience: "saldovio-finance-api",
    });

    expect(payload.sub).toBe("42");
  });
});

describe("getAuthorizedHeaders", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
    authMock.mockReset();
  });

  it("throws when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { getAuthorizedHeaders } = await import("./internal-auth");

    await expect(getAuthorizedHeaders()).rejects.toThrow("Not authenticated");
  });
});

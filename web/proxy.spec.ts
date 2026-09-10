import { describe, expect, it, vi } from "vitest";

// next-auth transitively imports "next/server" as an extensionless bare
// specifier; Next's own bundler tolerates this but Vitest's stricter ESM
// resolver does not (next-auth's own source even flags the same import
// with its own type-suppression comment). Mocking "@/auth" sidesteps
// that resolution failure without weakening what this test checks:
// proxy.ts's own export wiring (the export name and the matcher), not
// next-auth's internals — same mocking boundary app/page.spec.tsx
// already uses for the same reason.
vi.mock("@/auth", () => ({ auth: () => {} }));

import { proxy, config } from "./proxy";

describe("proxy wiring", () => {
  it("exports a proxy function", () => {
    expect(typeof proxy).toBe("function");
  });

  it("matcher excludes /api, _next/static, _next/image, and favicon.ico", () => {
    expect(config.matcher).toEqual([
      "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});

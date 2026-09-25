import { describe, expect, it } from "vitest";

// Auth.js v5's own defaultCookies() (packages/core/src/lib/utils/cookie.ts)
// derives httpOnly/sameSite/secure automatically from whether the app is
// served over HTTPS — nothing in web/auth.ts overrides this, and this
// test exists to make sure nobody adds an override later without it
// being a deliberate, reviewed change (S04.13).
describe("auth.ts cookie configuration", () => {
  it("does not define a custom `cookies` option (relies on Auth.js v5's secure defaults)", async () => {
    // Uses node:path/node:url explicitly rather than the ambient `URL`
    // global: under vitest's jsdom test environment, globalThis.URL is
    // jsdom's own implementation, and fs.readFile() rejects a URL
    // instance it didn't construct itself ("must be of scheme file")
    // even though it stringifies identically to a real file: URL.
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const authFilePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "auth.ts"
    );
    const authModuleSource = await fs.readFile(authFilePath, "utf-8");
    expect(authModuleSource).not.toMatch(/cookies\s*:/);
  });
});

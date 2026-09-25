import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config headers() (S04.14)", () => {
  it("applies report-only CSP and baseline security headers to every path", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeDefined();
    const rules = await headersFn!();
    const allPaths = rules.find((rule) => rule.source === "/:path*");
    expect(allPaths).toBeDefined();

    const headerNames = allPaths!.headers.map((h) => h.key);
    expect(headerNames).toContain("Content-Security-Policy-Report-Only");
    expect(headerNames).toContain("X-Content-Type-Options");
    expect(headerNames).toContain("Referrer-Policy");
    expect(headerNames).toContain("X-Frame-Options");

    const xfo = allPaths!.headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
    const xcto = allPaths!.headers.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto?.value).toBe("nosniff");

    // The blanket "/:path*" rule must NOT carry Cache-Control — that
    // regression (final review finding) is what broke /_next/static
    // caching, since this rule matches every path including static assets.
    const headerKeys = allPaths!.headers.map((h) => h.key);
    expect(headerKeys).not.toContain("Cache-Control");
  });

  it("applies Cache-Control: private, no-store to app routes but excludes /_next/static", async () => {
    const headersFn = nextConfig.headers;
    const rules = await headersFn!();
    const cacheRule = rules.find((rule) =>
      rule.headers.some((h) => h.key === "Cache-Control"),
    );
    expect(cacheRule).toBeDefined();

    const cacheControl = cacheRule!.headers.find((h) => h.key === "Cache-Control");
    expect(cacheControl?.value).toBe("private, no-store");

    // Source must be a negative-lookahead pattern that excludes
    // /_next/static, not the blanket "/:path*" rule.
    expect(cacheRule!.source).not.toBe("/:path*");
    expect(cacheRule!.source).toContain("_next/static");

    // path-to-regexp (Next.js's own route matcher) isn't resolvable as a
    // standalone import from this package's node_modules — it ships
    // bundled inside next's compiled dist, not as a usable dependency —
    // so this test proves the regex FRAGMENT's semantics directly with
    // the platform RegExp engine (the same engine path-to-regexp compiles
    // onto), and the real end-to-end proof is the manual curl check
    // against a built+started server documented in the Story 1 final
    // fix-wave report.
    const fragment = cacheRule!.source.replace(/^\/\(/, "").replace(/\)$/, "");
    const compiled = new RegExp(`^${fragment}$`);
    expect(compiled.test("_next/static/chunks/main-abc123.js")).toBe(false);
    expect(compiled.test("login")).toBe(true);
    expect(compiled.test("")).toBe(true);
    expect(compiled.test("transactions")).toBe(true);
  });
});

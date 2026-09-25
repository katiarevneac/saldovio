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
  });
});

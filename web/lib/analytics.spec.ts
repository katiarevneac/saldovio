import { describe, expect, it, vi, beforeEach } from "vitest";

// analytics.ts is guarded by `import "server-only"`, which throws
// unconditionally outside a React Server Component build (its package
// resolves to a "react-server"-conditional empty module there, a
// condition Vitest's default jsdom resolution doesn't request). Mocked
// here, scoped to this file, so the module under test can be imported
// directly rather than only indirectly through page-level mocks.
vi.mock("server-only", () => ({}));

describe("getForecast", () => {
  beforeEach(() => {
    vi.stubEnv("ANALYTICS_API_SECRET", "test-secret");
  });

  it("sends the shared secret header on every call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        forecastBalance: "0",
        calculationDate: "2026-01-01",
        windowEndDate: "2026-01-31",
        formulaVersion: "1.0",
        assumptions: [],
        dailyBalances: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getForecast } = await import("./analytics");
    await getForecast("100.00", [], "2026-01-31");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Analytics-Secret": "test-secret" }),
      })
    );
  });
});

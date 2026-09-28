import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { signInternalTokenMock } = vi.hoisted(() => ({
  signInternalTokenMock: vi.fn(),
}));
vi.mock("./internal-auth", () => ({ signInternalToken: signInternalTokenMock }));

describe("fetchSessionVersion", () => {
  beforeEach(() => {
    signInternalTokenMock.mockReset();
    signInternalTokenMock.mockResolvedValue("signed-token");
  });

  it("returns the current version on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ session_version: 3 }),
      })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "current", version: 3 });
  });

  it("returns not-found on a 404 (deleted user)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "not-found" });
  });

  it("returns unavailable on a non-404 error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the fetch itself throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when signing the internal token itself fails", async () => {
    signInternalTokenMock.mockRejectedValue(new Error("no secret configured"));
    const { fetchSessionVersion } = await import("./session-version");

    expect(await fetchSessionVersion("42")).toEqual({ status: "unavailable" });
  });
});

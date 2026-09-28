import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchSessionVersionMock } = vi.hoisted(() => ({
  fetchSessionVersionMock: vi.fn(),
}));
vi.mock("./session-version", () => ({ fetchSessionVersion: fetchSessionVersionMock }));

import { resolveSessionVersion } from "./session-jwt";
import { handleJwtCallback } from "./session-jwt";

describe("resolveSessionVersion (pure)", () => {
  it("keeps the token version when the DB agrees", () => {
    expect(resolveSessionVersion(2, { status: "current", version: 2 })).toBe(2);
  });

  it("invalidates when the DB version has moved (sign-out-all-devices happened)", () => {
    expect(resolveSessionVersion(2, { status: "current", version: 3 })).toBeNull();
  });

  it("invalidates on not-found (user deleted)", () => {
    expect(resolveSessionVersion(2, { status: "not-found" })).toBeNull();
  });

  it("fails open (keeps the token version) when the check is unavailable", () => {
    expect(resolveSessionVersion(2, { status: "unavailable" })).toBe(2);
  });
});

describe("handleJwtCallback", () => {
  beforeEach(() => {
    fetchSessionVersionMock.mockReset();
  });

  it("on sign-in (user present), seeds the token from the user object without calling fetchSessionVersion", async () => {
    const result = await handleJwtCallback({}, { id: "7", sessionVersion: 5 });

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
    expect(fetchSessionVersionMock).not.toHaveBeenCalled();
  });

  it("on a subsequent request, checks the current version and keeps the session when it matches", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "current", version: 5 });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
    expect(fetchSessionVersionMock).toHaveBeenCalledWith("7");
  });

  it("returns null (invalidating the session) when the version has moved", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "current", version: 6 });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toBeNull();
  });

  it("returns null when the user has been deleted", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "not-found" });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toBeNull();
  });

  it("returns the token unchanged (fail open) when the check is unavailable", async () => {
    fetchSessionVersionMock.mockResolvedValue({ status: "unavailable" });

    const result = await handleJwtCallback({ id: "7", sessionVersion: 5 }, undefined);

    expect(result).toEqual({ id: "7", sessionVersion: 5 });
  });

  it("returns null for a token with no id and no incoming user (should never happen, but must not crash or loop)", async () => {
    const result = await handleJwtCallback({}, undefined);

    expect(result).toBeNull();
    expect(fetchSessionVersionMock).not.toHaveBeenCalled();
  });
});

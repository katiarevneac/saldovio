import { describe, expect, it } from "vitest";
import { isPathAuthorized } from "./route-protection";

describe("isPathAuthorized", () => {
  it("allows an authenticated request to a protected path", () => {
    expect(isPathAuthorized({ hasSession: true, pathname: "/" })).toBe(true);
  });

  it("blocks an unauthenticated request to a protected path", () => {
    expect(isPathAuthorized({ hasSession: false, pathname: "/" })).toBe(false);
  });

  it("allows an unauthenticated request to /login (no redirect loop)", () => {
    expect(isPathAuthorized({ hasSession: false, pathname: "/login" })).toBe(
      true
    );
  });

  it("allows an unauthenticated request to /signup", () => {
    expect(isPathAuthorized({ hasSession: false, pathname: "/signup" })).toBe(
      true
    );
  });
});

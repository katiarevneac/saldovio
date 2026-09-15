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

  it("blocks an unauthenticated request to /transactions", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/transactions" })
    ).toBe(false);
  });

  it("allows an authenticated request to /transactions", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/transactions" })
    ).toBe(true);
  });

  it("blocks an unauthenticated request to /accounts", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/accounts" })
    ).toBe(false);
  });

  it("allows an authenticated request to /accounts", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/accounts" })
    ).toBe(true);
  });

  it("blocks an unauthenticated request to /forecast", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/forecast" })
    ).toBe(false);
  });

  it("allows an authenticated request to /forecast", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/forecast" })
    ).toBe(true);
  });

  it("blocks an unauthenticated request to /simulator", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/simulator" })
    ).toBe(false);
  });

  it("allows an authenticated request to /simulator", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/simulator" })
    ).toBe(true);
  });
});

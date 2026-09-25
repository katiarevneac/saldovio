import { describe, expect, it } from "vitest";
import { validateEnv } from "./validate-env";

describe("validateEnv (web)", () => {
  const REQUIRED = ["AUTH_SECRET", "INTERNAL_API_SECRET"];

  it("does not throw when every required key is a non-empty string", () => {
    expect(() =>
      validateEnv({ AUTH_SECRET: "a", INTERNAL_API_SECRET: "b" }, REQUIRED)
    ).not.toThrow();
  });

  it("throws listing a missing key", () => {
    expect(() =>
      validateEnv({ AUTH_SECRET: "a", INTERNAL_API_SECRET: "" }, REQUIRED)
    ).toThrow(/INTERNAL_API_SECRET/);
  });
});

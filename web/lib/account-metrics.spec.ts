import { describe, expect, it } from "vitest";
import { computePercentOfTotal, formatPercent } from "./account-metrics";

describe("computePercentOfTotal", () => {
  it("computes the percentage an account's balance represents of the total", () => {
    expect(computePercentOfTotal(2500, 10000)).toBe(25);
  });

  it("returns null when the total is zero or negative, instead of a misleading or fabricated value", () => {
    expect(computePercentOfTotal(0, 0)).toBeNull();
    expect(computePercentOfTotal(500, 0)).toBeNull();
    expect(computePercentOfTotal(500, -100)).toBeNull();
    expect(computePercentOfTotal(-500, -100)).toBeNull();
  });

  it("handles a negative account balance against a positive total", () => {
    expect(computePercentOfTotal(-2500, 10000)).toBe(-25);
  });

  it("returns 100 when the account is the only positive contributor", () => {
    expect(computePercentOfTotal(10000, 10000)).toBe(100);
  });
});

describe("formatPercent", () => {
  it("formats a percentage to one decimal place", () => {
    expect(formatPercent(33.333)).toBe("33.3% of total");
  });

  it("formats a whole-number percentage with a trailing .0", () => {
    expect(formatPercent(25)).toBe("25.0% of total");
  });

  it("returns an explicit unavailable message for null, never a fabricated value", () => {
    expect(formatPercent(null)).toBe("% of total: unavailable");
  });
});

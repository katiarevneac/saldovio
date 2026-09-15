import { describe, expect, it } from "vitest";
import { computeWindowEnd } from "./forecast-window";

describe("computeWindowEnd", () => {
  it("falls back to today + horizonDays when payday is unset", () => {
    expect(computeWindowEnd("2026-09-09", null, 30)).toBe("2026-10-09");
  });

  it("respects a horizonDays other than 30 when payday is unset", () => {
    expect(computeWindowEnd("2026-09-09", null, 10)).toBe("2026-09-19");
  });

  it("returns this month's payday when it is still upcoming", () => {
    expect(computeWindowEnd("2026-09-09", 15, 30)).toBe("2026-09-15");
  });

  it("returns next month's payday when today IS payday (strictly future, not today)", () => {
    expect(computeWindowEnd("2026-09-09", 9, 30)).toBe("2026-10-09");
  });

  it("returns next month's payday when this month's has already passed", () => {
    expect(computeWindowEnd("2026-09-09", 5, 30)).toBe("2026-10-05");
  });

  it("clamps payday=31 to a 28-day February", () => {
    expect(computeWindowEnd("2026-02-15", 31, 30)).toBe("2026-02-28");
  });

  it("rolls over into next year when payday has passed in December", () => {
    expect(computeWindowEnd("2026-12-20", 5, 30)).toBe("2027-01-05");
  });

  it("ignores horizonDays entirely once payday is set", () => {
    expect(computeWindowEnd("2026-09-09", 15, 5)).toBe("2026-09-15");
  });
});

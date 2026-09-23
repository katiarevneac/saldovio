import { describe, expect, it } from "vitest";
import { isBackdated } from "./backdated";

describe("isBackdated", () => {
  describe("legacy_inclusive (ADR 0002: reference_date itself is already baked in)", () => {
    it("is backdated when occurredOn is before reference_date", () => {
      expect(isBackdated("2026-09-01", "2026-09-10", "legacy_inclusive")).toBe(true);
    });

    it("is backdated when occurredOn equals reference_date", () => {
      expect(isBackdated("2026-09-10", "2026-09-10", "legacy_inclusive")).toBe(true);
    });

    it("is not backdated when occurredOn is after reference_date", () => {
      expect(isBackdated("2026-09-11", "2026-09-10", "legacy_inclusive")).toBe(false);
    });
  });

  describe("start_of_day (ADR 0002: reference_date itself counts as new activity)", () => {
    it("is backdated when occurredOn is before reference_date", () => {
      expect(isBackdated("2026-09-01", "2026-09-10", "start_of_day")).toBe(true);
    });

    it("is not backdated when occurredOn equals reference_date", () => {
      expect(isBackdated("2026-09-10", "2026-09-10", "start_of_day")).toBe(false);
    });

    it("is not backdated when occurredOn is after reference_date", () => {
      expect(isBackdated("2026-09-11", "2026-09-10", "start_of_day")).toBe(false);
    });
  });
});

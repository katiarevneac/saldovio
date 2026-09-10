import { describe, expect, it } from "vitest";
import { formatAmountValue } from "./money";

describe("formatAmountValue", () => {
  it("formats a positive amount with two decimals and RO grouping", () => {
    expect(formatAmountValue(2485000)).toBe("24.850,00");
  });

  it("formats zero", () => {
    expect(formatAmountValue(0)).toBe("0,00");
  });

  it("formats a negative amount with a leading minus sign", () => {
    expect(formatAmountValue(-735000)).toBe("-7.350,00");
  });
});

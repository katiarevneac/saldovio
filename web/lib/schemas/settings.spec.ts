import { describe, expect, it } from "vitest";
import { UpdateSettingsSchema, DeleteAccountSchema } from "./settings";

describe("UpdateSettingsSchema", () => {
  it("parses a full set of values", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "1500.50",
      payday: "15",
      horizonDays: "45",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ essentialSpend: 1500.5, payday: 15, horizonDays: 45 });
  });

  it("treats a blank essentialSpend as null, not zero", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "",
      payday: "1",
      horizonDays: "30",
    });

    expect(result.success).toBe(true);
    expect(result.data?.essentialSpend).toBeNull();
  });

  it("treats a blank payday as null", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "0",
      payday: "",
      horizonDays: "30",
    });

    expect(result.success).toBe(true);
    expect(result.data?.payday).toBeNull();
  });

  it("rejects a negative essentialSpend", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "-10",
      payday: "",
      horizonDays: "30",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payday outside 1-31", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "",
      payday: "32",
      horizonDays: "30",
    });

    expect(result.success).toBe(false);
  });

  it("rejects horizonDays above the 365-day ceiling shared with finance-api and Analytics Service", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "",
      payday: "",
      horizonDays: "366",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a blank horizonDays (unlike essentialSpend/payday, it has no null variant)", () => {
    const result = UpdateSettingsSchema.safeParse({
      essentialSpend: "",
      payday: "",
      horizonDays: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("DeleteAccountSchema", () => {
  it("accepts a non-empty password", () => {
    const result = DeleteAccountSchema.safeParse({ password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password with a clear message", () => {
    const result = DeleteAccountSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });
});

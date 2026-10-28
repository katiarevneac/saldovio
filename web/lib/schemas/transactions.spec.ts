import { describe, it, expect } from "vitest";
import { CreateTransferSchema } from "./transactions";

const valid = {
  sourceAccountId: 1,
  destinationAccountId: 2,
  amount: 50,
  occurredOn: "2026-10-01",
};

describe("CreateTransferSchema", () => {
  it("accepts a valid transfer, category optional", () => {
    expect(CreateTransferSchema.safeParse(valid).success).toBe(true);
    expect(CreateTransferSchema.safeParse({ ...valid, category: "Savings" }).success).toBe(true);
  });

  it("rejects identical source and destination", () => {
    const r = CreateTransferSchema.safeParse({ ...valid, destinationAccountId: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain("Choose two different accounts");
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of [0, -5]) {
      const r = CreateTransferSchema.safeParse({ ...valid, amount });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain("Amount must be greater than zero");
    }
  });

  it("rejects missing or malformed dates", () => {
    expect(CreateTransferSchema.safeParse({ ...valid, occurredOn: "" }).success).toBe(false);
    expect(CreateTransferSchema.safeParse({ ...valid, occurredOn: "01/10/2026" }).success).toBe(false);
  });
});

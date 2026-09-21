import { describe, expect, it } from "vitest";
import { toCommitRow, type ImportPreviewRow } from "./import";

describe("toCommitRow", () => {
  it("maps a valid preview row to a commit row, converting amount to a number", () => {
    const row: ImportPreviewRow = {
      hash: "abc123",
      status: "valid",
      description: "Grocery store",
      occurred_on: "2026-09-10",
      type: "expense",
      amount: "-45.30",
      category: "CARD_PAYMENT",
      reason: null,
    };

    expect(toCommitRow(row)).toEqual({
      hash: "abc123",
      occurredOn: "2026-09-10",
      type: "expense",
      amount: -45.3,
      category: "CARD_PAYMENT",
    });
  });

  it("falls back to an empty string category when category is null", () => {
    const row: ImportPreviewRow = {
      hash: "def456",
      status: "valid",
      description: "Salary",
      occurred_on: "2026-09-01",
      type: "income",
      amount: "3000",
      category: null,
      reason: null,
    };

    expect(toCommitRow(row).category).toBe("");
  });
});

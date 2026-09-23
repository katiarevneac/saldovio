// This is the one place `web` defines the shape of a CSV import
// preview/commit row. finance-api's own types (`ParsedRow` in
// revolut-parser.ts, `ImportRowInput` in transactions.service.ts) are
// the source of truth server-side and can't be imported directly
// across the service boundary (no shared package) — but within `web`,
// every place that renders a preview row or builds a commit payload
// goes through these types and `toCommitRow`, so the two can't drift
// from each other on this side of the wire.

export type ImportRowStatus = "valid" | "duplicate" | "error" | "skipped";

export type ImportPreviewRow = {
  hash: string;
  status: ImportRowStatus;
  description: string;
  occurred_on: string | null;
  type: "income" | "expense" | null;
  amount: string | null;
  category: string | null;
  reason: string | null;
  backdated: boolean | null;
};

export type ImportCommitRow = {
  hash: string;
  occurredOn: string;
  type: "income" | "expense";
  amount: number;
  category: string;
};

// Only ever called on a row whose status is "valid" (the UI disables
// the checkbox for every other status) — finance-api's parser
// guarantees occurred_on/type/amount are non-null exactly when status
// is "valid" (see revolut-parser.ts's parseRecord).
export function toCommitRow(row: ImportPreviewRow): ImportCommitRow {
  return {
    hash: row.hash,
    occurredOn: row.occurred_on as string,
    type: row.type as "income" | "expense",
    amount: Number(row.amount),
    category: row.category ?? "",
  };
}

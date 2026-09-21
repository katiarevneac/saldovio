import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { previewImportActionMock, commitImportActionMock } = vi.hoisted(() => ({
  previewImportActionMock: vi.fn(),
  commitImportActionMock: vi.fn(),
}));
vi.mock("@/app/actions", () => ({
  previewImportAction: previewImportActionMock,
  commitImportAction: commitImportActionMock,
}));

import ImportCsvForm from "./ImportCsvForm";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-01-01",
    balance: "100.00",
  },
];

const previewRows = [
  {
    hash: "h1",
    status: "valid" as const,
    description: "Grocery store",
    occurred_on: "2026-09-10",
    type: "expense" as const,
    amount: "-45.30",
    category: "CARD_PAYMENT",
    reason: null,
  },
  {
    hash: "h2",
    status: "duplicate" as const,
    description: "Rent",
    occurred_on: "2026-09-01",
    type: "expense" as const,
    amount: "-1200",
    category: "TRANSFER",
    reason: "Already imported",
  },
];

function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  previewImportActionMock.mockReset();
  commitImportActionMock.mockReset();
});

describe("ImportCsvForm", () => {
  it("previews a chosen file and renders rows with checkboxes reflecting status", async () => {
    previewImportActionMock.mockResolvedValue({ rows: previewRows });
    const onClose = vi.fn();

    render(<ImportCsvForm accounts={accounts} onClose={onClose} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Grocery store")).toBeInTheDocument();
    });

    expect(previewImportActionMock).toHaveBeenCalledTimes(1);
    const formDataArg = previewImportActionMock.mock.calls[0][0] as FormData;
    expect(formDataArg.get("accountId")).toBe("1");
    expect(formDataArg.get("file")).toBe(file);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked(); // valid row
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked(); // duplicate row
    expect(checkboxes[1]).toBeDisabled();
    expect(screen.getByText("Already imported")).toBeInTheDocument();
  });

  it("commits only the checked rows and reports the result", async () => {
    previewImportActionMock.mockResolvedValue({ rows: previewRows });
    commitImportActionMock.mockResolvedValue({ imported: 1, skipped_duplicates: 0 });
    const onClose = vi.fn();

    render(<ImportCsvForm accounts={accounts} onClose={onClose} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText("Grocery store"));

    fireEvent.click(screen.getByRole("button", { name: "Commit selected" }));

    await waitFor(() => {
      expect(screen.getByText("Imported 1 transaction.")).toBeInTheDocument();
    });

    expect(commitImportActionMock).toHaveBeenCalledWith({
      accountId: 1,
      rows: [
        {
          hash: "h1",
          occurredOn: "2026-09-10",
          type: "expense",
          amount: -45.3,
          category: "CARD_PAYMENT",
        },
      ],
    });
  });

  it("shows an error message when preview fails", async () => {
    previewImportActionMock.mockRejectedValue(new Error("Could not parse CSV file"));

    render(<ImportCsvForm accounts={accounts} onClose={vi.fn()} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Could not parse CSV file")).toBeInTheDocument();
    });
  });
});

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
    opening_boundary: "start_of_day" as const,
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
    backdated: false,
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
    backdated: false,
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

  it("marks a backdated valid row without blocking it from being importable", async () => {
    const rowsWithBackdated = [
      {
        hash: "h1",
        status: "valid" as const,
        description: "Old coffee",
        occurred_on: "2026-01-05",
        type: "expense" as const,
        amount: "-12.50",
        category: "CARD_PAYMENT",
        reason: null,
        backdated: true,
      },
    ];
    previewImportActionMock.mockResolvedValue({ rows: rowsWithBackdated });

    render(<ImportCsvForm accounts={accounts} onClose={vi.fn()} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Old coffee")).toBeInTheDocument();
    });

    expect(screen.getByText("Before opening balance")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(checkbox).not.toBeDisabled();
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

  it("disables commit and shows a message when every previewed row is a duplicate", async () => {
    const allDuplicateRows = [
      {
        hash: "h1",
        status: "duplicate" as const,
        description: "Grocery store",
        occurred_on: "2026-09-10",
        type: "expense" as const,
        amount: "-45.30",
        category: "CARD_PAYMENT",
        reason: "Already imported",
        backdated: false,
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
        backdated: false,
      },
    ];
    previewImportActionMock.mockResolvedValue({ rows: allDuplicateRows });

    render(<ImportCsvForm accounts={accounts} onClose={vi.fn()} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Grocery store")).toBeInTheDocument();
    });

    const commitButton = screen.getByRole("button", { name: "Commit selected" });
    expect(commitButton).toBeDisabled();
    expect(screen.getByText("Nothing selected to import.")).toBeInTheDocument();

    fireEvent.click(commitButton);
    expect(commitImportActionMock).not.toHaveBeenCalled();
  });

  it("keeps distinct checked state for two rows sharing the same hash", async () => {
    const sharedHashRows = [
      {
        hash: "h-shared",
        status: "valid" as const,
        description: "First occurrence",
        occurred_on: "2026-09-10",
        type: "expense" as const,
        amount: "-45.30",
        category: "CARD_PAYMENT",
        reason: null,
        backdated: false,
      },
      {
        hash: "h-shared",
        status: "duplicate" as const,
        description: "Second occurrence (in-file dup)",
        occurred_on: "2026-09-10",
        type: "expense" as const,
        amount: "-45.30",
        category: "CARD_PAYMENT",
        reason: "Duplicate within file",
        backdated: false,
      },
    ];
    previewImportActionMock.mockResolvedValue({ rows: sharedHashRows });
    commitImportActionMock.mockResolvedValue({ imported: 1, skipped_duplicates: 0 });

    render(<ImportCsvForm accounts={accounts} onClose={vi.fn()} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("First occurrence")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked(); // valid row, not overwritten by the duplicate's initial state
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[1]).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Commit selected" }));

    await waitFor(() => {
      expect(screen.getByText("Imported 1 transaction.")).toBeInTheDocument();
    });

    expect(commitImportActionMock).toHaveBeenCalledWith({
      accountId: 1,
      rows: [
        {
          hash: "h-shared",
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

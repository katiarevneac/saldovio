import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/app/actions", () => ({
  previewImportAction: vi.fn(),
  commitImportAction: vi.fn(),
}));

import ImportCsvModal from "./ImportCsvModal";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-01-01",
    opening_boundary: "start_of_day" as const, configured: true,
    balance: "100.00",
  },
];

describe("ImportCsvModal", () => {
  it("opens the modal with the import form when the trigger is clicked", () => {
    render(<ImportCsvModal accounts={accounts} />);

    expect(
      screen.queryByRole("heading", { name: "Import transactions from CSV" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    expect(
      screen.getByRole("heading", { name: "Import transactions from CSV" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("closes the modal when the close button is clicked", () => {
    render(<ImportCsvModal accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("heading", { name: "Import transactions from CSV" })
    ).not.toBeInTheDocument();
  });
});

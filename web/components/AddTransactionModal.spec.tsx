import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

// TransactionForm statically imports "@/app/actions", which imports
// "@/lib/internal-auth" (`import "server-only"`) — mock it out so that
// real server-only code never enters this test's module graph, same
// pattern used in page.spec.tsx.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
}));

import AddTransactionModal from "./AddTransactionModal";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-01-01",
    balance: "100.00",
  },
];

describe("AddTransactionModal", () => {
  it("opens the modal with the transaction form when the trigger is clicked", () => {
    render(<AddTransactionModal accounts={accounts} />);

    expect(
      screen.queryByRole("heading", { name: "Add transaction" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Add transaction" }));

    expect(
      screen.getByRole("heading", { name: "Add transaction" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("closes the modal when the close button is clicked", () => {
    render(<AddTransactionModal accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add transaction" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("heading", { name: "Add transaction" })
    ).not.toBeInTheDocument();
  });
});

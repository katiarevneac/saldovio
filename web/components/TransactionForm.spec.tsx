import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

// Same reason as AddTransactionModal.spec.tsx: keep server-only code
// ("@/lib/internal-auth", imported transitively via "@/app/actions") out
// of this test's module graph.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
}));

import TransactionForm from "./TransactionForm";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-09-15",
    opening_boundary: "start_of_day" as const, configured: true,
    archived: false, protectedSavings: false,
    balance: "100.00",
  },
];

describe("TransactionForm", () => {
  it("shows a backdated notice when the chosen date is before the account's opening balance", () => {
    render(<TransactionForm accounts={accounts} />);

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });

    expect(
      screen.getByText(/won't change.*current balance/i)
    ).toBeInTheDocument();
  });

  it("shows no backdated notice when the chosen date is on/after the account's opening balance", () => {
    render(<TransactionForm accounts={accounts} />);

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-15" },
    });

    expect(screen.queryByText(/won't change.*current balance/i)).not.toBeInTheDocument();
  });
});

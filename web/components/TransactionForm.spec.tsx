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
  createTransferAction: vi.fn(),
}));

import { waitFor } from "@testing-library/react";
import { createTransactionAction, createTransferAction } from "@/app/actions";
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

  describe("transfer", () => {
    const two = [
      accounts[0],
      { ...accounts[0], id: 2, name: "Cash", reference_date: "2026-09-01" },
    ];
    const selectTransfer = () =>
      fireEvent.change(screen.getByLabelText("Type"), { target: { value: "transfer" } });

    it("shows From/To and hides the single Account select", () => {
      render(<TransactionForm accounts={two} />);
      selectTransfer();
      expect(screen.getByLabelText("From")).toHaveValue("1");
      expect(screen.getByLabelText("To")).toHaveValue("2");
      expect(screen.queryByLabelText("Account")).not.toBeInTheDocument();
    });

    it("shows the schema error when both accounts are the same", async () => {
      render(<TransactionForm accounts={two} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "1" } });
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
      fireEvent.submit(screen.getByRole("button", { name: /add transaction/i }).closest("form")!);
      expect(await screen.findByText(/Choose two different accounts/)).toBeInTheDocument();
      expect(createTransferAction).not.toHaveBeenCalled();
    });

    it("blocks submit and names the account when From is backdated", () => {
      render(<TransactionForm accounts={two} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-10" } });
      expect(screen.getByText(/Cont curent.*2026-09-15/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add transaction/i })).toBeDisabled();
    });

    it("blocks submit and names the account when To is backdated", () => {
      const accs = [
        { ...two[0], reference_date: "2026-01-01" },
        { ...two[1], reference_date: "2026-09-15" },
      ];
      render(<TransactionForm accounts={accs} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-10" } });
      expect(screen.getByText(/Cash.*2026-09-15/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add transaction/i })).toBeDisabled();
    });

    it("does not call createTransferAction when the form is submitted directly while backdated", () => {
      render(<TransactionForm accounts={two} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-10" } });
      fireEvent.submit(screen.getByRole("button", { name: /add transaction/i }).closest("form")!);
      expect(createTransferAction).not.toHaveBeenCalled();
    });

    it("calls createTransferAction with positive numeric payload, not createTransactionAction", async () => {
      const onSuccess = vi.fn();
      vi.mocked(createTransferAction).mockResolvedValue(undefined);
      render(<TransactionForm accounts={two} onSuccess={onSuccess} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25.5" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
      fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Move" } });
      fireEvent.click(screen.getByRole("button", { name: /add transaction/i }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(createTransferAction).toHaveBeenCalledWith({
        sourceAccountId: 1,
        destinationAccountId: 2,
        amount: 25.5,
        occurredOn: "2026-10-01",
        category: "Move",
      });
      expect(createTransactionAction).not.toHaveBeenCalled();
    });

    it("shows server error on failure", async () => {
      vi.mocked(createTransferAction).mockRejectedValue(new Error("Boom"));
      render(<TransactionForm accounts={two} />);
      selectTransfer();
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
      fireEvent.click(screen.getByRole("button", { name: /add transaction/i }));
      expect(await screen.findByText("Boom")).toBeInTheDocument();
    });

    it("disables the Transfer option with fewer than 2 accounts", () => {
      render(<TransactionForm accounts={accounts} />);
      expect(screen.getByRole("option", { name: "Transfer" })).toBeDisabled();
    });
  });

  it("expense path still calls createTransactionAction with a signed amount", async () => {
    vi.mocked(createTransactionAction).mockResolvedValue(undefined);
    render(<TransactionForm accounts={accounts} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: /add transaction/i }));
    await waitFor(() =>
      expect(createTransactionAction).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 1, type: "expense", amount: -12 }),
      ),
    );
    expect(createTransferAction).not.toHaveBeenCalled();
  });

  it("ignores a second submit while the first is still in flight", async () => {
    vi.mocked(createTransactionAction).mockClear();
    vi.mocked(createTransactionAction).mockReturnValue(new Promise(() => {}));
    render(<TransactionForm accounts={accounts} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
    const form = screen.getByRole("button", { name: /add transaction/i }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createTransactionAction).toHaveBeenCalledTimes(1);
  });
});

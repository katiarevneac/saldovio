import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// AccountCorrectionForm's form action binds the real Server Action, which
// imports "@/lib/internal-auth" (`import "server-only"`) — mock it out of
// this test's module graph, same pattern as TransactionForm.spec.tsx.
vi.mock("@/app/actions", () => ({
  updateAccountAction: vi.fn(() => () => {}),
}));

import AccountCorrectionForm from "./AccountCorrectionForm";

describe("AccountCorrectionForm", () => {
  it("shows the current balance as the initial preview when nothing has changed", () => {
    render(
      <AccountCorrectionForm
        accountId={1}
        name="Cont curent"
        currentBalance="100.00"
        referenceDate="2026-01-15"
        openingBoundary="start_of_day"
        transactions={[]}
        today="2026-06-01"
      />
    );

    expect(screen.getByTestId("balance-preview")).toHaveTextContent("100,00");
  });

  it("updates the live preview when the starting balance is edited", () => {
    render(
      <AccountCorrectionForm
        accountId={1}
        name="Cont curent"
        currentBalance="100.00"
        referenceDate="2026-01-15"
        openingBoundary="start_of_day"
        transactions={[]}
        today="2026-06-01"
      />
    );

    fireEvent.change(screen.getByLabelText("Starting balance"), {
      target: { value: "500" },
    });

    expect(screen.getByTestId("balance-preview")).toHaveTextContent("500,00");
  });

  it("updates the live preview when the reference date is edited, honoring the boundary", () => {
    render(
      <AccountCorrectionForm
        accountId={1}
        name="Cont curent"
        currentBalance="100.00"
        referenceDate="2026-01-15"
        openingBoundary="start_of_day"
        transactions={[{ occurredOn: "2026-02-01", amountBani: 2000 }]}
        today="2026-06-01"
      />
    );

    // Reference date is before the transaction: already included (>=).
    expect(screen.getByTestId("balance-preview")).toHaveTextContent("120,00");

    fireEvent.change(screen.getByLabelText("As of date"), {
      target: { value: "2026-03-01" },
    });

    // Now the reference date is after the transaction: no longer included.
    expect(screen.getByTestId("balance-preview")).toHaveTextContent("100,00");
  });
});

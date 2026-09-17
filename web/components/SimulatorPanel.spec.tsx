import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SimulatorPanel from "./SimulatorPanel";
import type { RecurringRule } from "@/lib/recurring-rules";

const { simulatePurchaseSpy } = vi.hoisted(() => ({ simulatePurchaseSpy: vi.fn() }));
vi.mock("@/lib/simulator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/simulator")>();
  return {
    ...actual,
    simulatePurchase: (...args: Parameters<typeof actual.simulatePurchase>) => {
      simulatePurchaseSpy(...args);
      return actual.simulatePurchase(...args);
    },
  };
});

function buildRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    type: "expense",
    amount: "50.00",
    frequency: "monthly",
    day_of_month: 10,
    category: "Rent",
    active: true,
    ...overrides,
  };
}

describe("SimulatorPanel", () => {
  it("shows a 'Yes' verdict by default when no purchase amount is entered", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
      />
    );

    expect(screen.getByText(/this purchase looks affordable/)).toBeInTheDocument();
  });

  it("prefills the amount from initialAmountBani", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        initialAmountBani={25000}
        calculationDate="2026-09-14"
      />
    );

    expect(screen.getByLabelText("Purchase amount")).toHaveValue(250);
  });

  it("clicking a preset chip sets the amount and updates the verdict", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "2.500 RON" }));

    expect(screen.getByLabelText("Purchase amount")).toHaveValue(2500);
    expect(screen.getByText(/below zero/)).toBeInTheDocument();
  });

  it("switches to the deltas view and shows the comparison table", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Deltas" }));

    expect(screen.getByRole("columnheader", { name: "Without" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "With" })).toBeInTheDocument();
  });

  it("allows typing a decimal amount without it being reset", () => {
    render(
      <SimulatorPanel currentBalanceBani={100000} recurringRules={[]} calculationDate="2026-09-14" />
    );
    const input = screen.getByLabelText("Purchase amount");
    fireEvent.change(input, { target: { value: "150.5" } });
    expect(input).toHaveValue(150.5);
  });

  it("switches to the overlaid view and renders the chart", async () => {
    const { container } = render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[buildRule()]}
        calculationDate="2026-09-14"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Overlaid" }));

    // RTL's waitFor defaults to a 1000ms timeout, which the next/dynamic
    // lazy import + Recharts render can exceed under concurrent full-suite
    // load (29 jsdom environments spinning up together) even though it
    // resolves in well under 1s in isolation — a test-environment timing
    // margin, not a production behavior issue.
    await waitFor(
      () => {
        expect(container.querySelector("svg")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("forwards the windowEndDate prop into simulatePurchase", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
        windowEndDate="2026-11-01"
      />
    );

    expect(simulatePurchaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ windowEndDate: "2026-11-01" })
    );
  });

  it("labels the projected-balance stat generically, not tied to a fixed 30 days", () => {
    render(
      <SimulatorPanel
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
      />
    );

    expect(screen.getAllByText("Projected balance").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Balance in 30 days/)).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SimulatorCard from "./SimulatorCard";

describe("SimulatorCard", () => {
  it("explains the verdict is based on essential spend when essentialSpendBani is set", () => {
    render(
      <SimulatorCard
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
        essentialSpendBani={150000}
      />
    );

    expect(screen.getByText(/Based on essential spend/)).toBeInTheDocument();
  });

  it("explains the verdict falls back to the 10% rule when essentialSpendBani is not set", () => {
    render(
      <SimulatorCard
        currentBalanceBani={100000}
        recurringRules={[]}
        calculationDate="2026-09-14"
      />
    );

    expect(screen.getByText(/Based on 10% of balance/)).toBeInTheDocument();
  });
});

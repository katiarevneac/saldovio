import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("renders label, formatted amount, and caption", () => {
    render(
      <KpiCard
        icon={<svg data-testid="icon" />}
        label="Total balance"
        amountBani={2485000}
        caption="Sum of 4 accounts"
      />
    );

    expect(screen.getByText("Total balance")).toBeInTheDocument();
    expect(screen.getByText("24.850,00")).toBeInTheDocument();
    expect(screen.getByText("Sum of 4 accounts")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders without a caption", () => {
    render(<KpiCard icon={<svg />} label="Monthly surplus" amountBani={0} />);

    expect(screen.getByText("Monthly surplus")).toBeInTheDocument();
    expect(screen.queryByText(/Sum of/)).not.toBeInTheDocument();
  });
});

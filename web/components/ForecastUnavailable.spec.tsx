import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForecastUnavailable from "./ForecastUnavailable";

describe("ForecastUnavailable", () => {
  it("renders an unavailable message", () => {
    render(<ForecastUnavailable />);

    expect(
      screen.getByText(/Forecast unavailable right now/)
    ).toBeInTheDocument();
  });
});

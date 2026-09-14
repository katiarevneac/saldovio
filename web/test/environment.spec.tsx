import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;
}

describe("vitest + jsdom + RTL harness", () => {
  it("renders a component and queries it via screen", () => {
    render(<Greeting name="Saldovio" />);
    expect(screen.getByText("Hello, Saldovio!")).toBeInTheDocument();
  });

  it("provides a ResizeObserver stub and a non-zero getBoundingClientRect for chart tests", () => {
    expect(typeof globalThis.ResizeObserver).toBe("function");
    const rect = document.createElement("div").getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });
});

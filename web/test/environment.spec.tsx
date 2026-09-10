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
});

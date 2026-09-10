import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-archivo-mock" }),
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("applies the Archivo font variable to the html element and renders children", () => {
    render(
      <RootLayout params={Promise.resolve({})}>
        <p>child content</p>
      </RootLayout>
    );

    expect(document.documentElement.className).toContain("font-archivo-mock");
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});

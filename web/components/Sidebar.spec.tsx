import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("renders a link with the correct href for each enabled nav item", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(
      screen.getByRole("link", { name: "Transactions" })
    ).toHaveAttribute("href", "/transactions");
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/accounts"
    );
  });

  it("marks the current route's link with aria-current, and no other link", () => {
    usePathnameMock.mockReturnValue("/transactions");
    render(<Sidebar />);

    expect(
      screen.getByRole("link", { name: "Transactions" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: "Accounts" })
    ).not.toHaveAttribute("aria-current");
  });

  it("renders Forecast as a real link, and Simulator/Settings as non-interactive", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Forecast" })).toHaveAttribute(
      "href",
      "/forecast"
    );

    expect(
      screen.queryByRole("link", { name: "Simulator" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Settings" })
    ).not.toBeInTheDocument();

    expect(screen.getByText("Simulator")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByText("Settings")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("marks Forecast active when on /forecast", () => {
    usePathnameMock.mockReturnValue("/forecast");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Forecast" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Accounts active for a nested route like /accounts/new", () => {
    usePathnameMock.mockReturnValue("/accounts/new");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: "Transactions" })
    ).not.toHaveAttribute("aria-current");
  });

  it("does not mark Overview active for a nested route, only for the exact root path", () => {
    usePathnameMock.mockReturnValue("/accounts");
    render(<Sidebar />);

    expect(
      screen.getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current");
  });
});

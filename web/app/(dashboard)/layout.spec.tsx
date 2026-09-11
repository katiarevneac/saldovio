import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: vi.fn(),
}));

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

import DashboardLayout from "./layout";

beforeEach(() => {
  authMock.mockReset();
  usePathnameMock.mockReturnValue("/");
});

describe("DashboardLayout", () => {
  it("renders the Saldovio header, the signed-in user's email, and the Sidebar", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });

    const element = await DashboardLayout({ children: <div>page content</div> });
    render(element);

    expect(screen.getByText("Saldovio")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders exactly one <main> landmark, wrapping the header and the page children", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });

    const element = await DashboardLayout({ children: <div>page content</div> });
    render(element);

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("omits the sign-out form when there is no session, without redirecting itself", async () => {
    authMock.mockResolvedValue(null);

    const element = await DashboardLayout({ children: <div>page content</div> });
    render(element);

    expect(screen.getByText("Saldovio")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log out" })
    ).not.toBeInTheDocument();
  });
});

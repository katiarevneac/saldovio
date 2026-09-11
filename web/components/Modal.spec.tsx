import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Modal from "./Modal";

describe("Modal", () => {
  it("mounts children and toggles the dialog's open attribute as the open prop changes", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Modal open={false} onClose={onClose}>
        <p>Contents</p>
      </Modal>
    );

    const dialog = container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(screen.queryByText("Contents")).not.toBeInTheDocument();

    rerender(
      <Modal open={true} onClose={onClose}>
        <p>Contents</p>
      </Modal>
    );
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByText("Contents")).toBeInTheDocument();

    rerender(
      <Modal open={false} onClose={onClose}>
        <p>Contents</p>
      </Modal>
    );
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(screen.queryByText("Contents")).not.toBeInTheDocument();
  });

  it("calls onClose when the dialog fires a native cancel event (Escape key)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        <p>Contents</p>
      </Modal>
    );

    container.querySelector("dialog")!.dispatchEvent(new Event("cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on a backdrop click but not on a click inside the content", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        <p>Contents</p>
      </Modal>
    );

    screen.getByText("Contents").click();
    expect(onClose).not.toHaveBeenCalled();

    container.querySelector("dialog")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the title as a heading when provided", () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Add transaction">
        <p>Contents</p>
      </Modal>
    );

    expect(screen.getByRole("heading", { name: "Add transaction" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add transaction" })).toBeInTheDocument();
  });
});

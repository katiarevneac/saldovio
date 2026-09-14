import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom 30 does not implement HTMLDialogElement's showModal()/close() —
// calling either throws "is not a function". Modal.tsx relies on both, so
// any test that renders a <dialog> needs this polyfill.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (typeof HTMLDialogElement.prototype.close !== "function") {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    const wasOpen = this.hasAttribute("open");
    this.removeAttribute("open");
    if (wasOpen) {
      this.dispatchEvent(new Event("close"));
    }
  };
}

// jsdom has no ResizeObserver at all, and Recharts' ResponsiveContainer
// (used by ForecastChart's Line mode) needs one to ever report a size.
// A no-op stub is enough — tests set a fixed getBoundingClientRect below
// instead of relying on real resize events.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom's default getBoundingClientRect always returns all-zero
// dimensions, which trips Recharts' "width/height should be greater
// than 0" guard and renders nothing. Charts aren't laid out for real in
// jsdom, so a fixed non-zero size is enough for structural assertions.
if (typeof Element.prototype.getBoundingClientRect === "function") {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return {
      width: 600,
      height: 300,
      top: 0,
      left: 0,
      right: 600,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
}

afterEach(cleanup);

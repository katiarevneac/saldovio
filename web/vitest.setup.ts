// jsdom 30 does not implement HTMLDialogElement's showModal()/close() —
// calling either throws "is not a function". Modal.tsx relies on both to
// drive the native <dialog> element, so every test that renders a <dialog>
// needs this polyfill in place first.
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

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

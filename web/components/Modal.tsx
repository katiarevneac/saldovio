"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./Modal.module.css";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // A click on the <dialog> element itself (not on a descendant inside
  // the content box) is a click on the native backdrop area.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={title ? titleId : undefined}
      onClose={onClose}
      onCancel={onClose}
      onClick={handleBackdropClick}
    >
      {open ? (
        <div className={styles.content}>
          {title ? (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          ) : null}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

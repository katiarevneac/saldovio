"use client";

import { useState } from "react";
import type { Account } from "@/lib/accounts";
import Modal from "@/components/Modal";
import ImportCsvForm from "@/components/ImportCsvForm";
import styles from "./ImportCsvModal.module.css";

export default function ImportCsvModal({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        Import CSV
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Import transactions from CSV">
        <ImportCsvForm accounts={accounts} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

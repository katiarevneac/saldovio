"use client";

import { useState } from "react";
import type { Account } from "@/lib/accounts";
import Modal from "@/components/Modal";
import TransactionForm from "@/components/TransactionForm";
import styles from "./AddTransactionModal.module.css";

export default function AddTransactionModal({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        + Add transaction
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add transaction">
        <TransactionForm accounts={accounts} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

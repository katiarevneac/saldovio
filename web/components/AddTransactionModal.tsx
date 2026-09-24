"use client";

import { useState } from "react";
import type { Account } from "@/lib/accounts";
import Modal from "@/components/Modal";
import TransactionForm from "@/components/TransactionForm";
import styles from "./AddTransactionModal.module.css";

export default function AddTransactionModal({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);

  const hasSelectableAccount = accounts.length > 0;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        disabled={!hasSelectableAccount}
        title={hasSelectableAccount ? undefined : "No accounts available — unarchive one first"}
      >
        + Add transaction
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add transaction">
        <TransactionForm accounts={accounts} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

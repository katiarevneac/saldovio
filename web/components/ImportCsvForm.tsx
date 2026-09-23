"use client";

import { useState, type FormEvent } from "react";
import { previewImportAction, commitImportAction } from "@/app/actions";
import type { Account } from "@/lib/accounts";
import { toCommitRow, type ImportPreviewRow } from "@/lib/import";
import styles from "./ImportCsvForm.module.css";

export default function ImportCsvForm({
  accounts,
  onClose,
}: {
  accounts: Account[];
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped_duplicates: number } | null>(
    null
  );

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!file) {
      setError("Choose a CSV file first");
      return;
    }
    setPreviewing(true);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("accountId", accountId);

    try {
      const response = await previewImportAction(formData);
      setRows(response.rows);
      const initialChecked: Record<string, boolean> = {};
      response.rows.forEach((row, index) => {
        initialChecked[`${row.hash}:${index}`] = row.status === "valid";
      });
      setChecked(initialChecked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setRows(null);
    } finally {
      setPreviewing(false);
    }
  }

  const selectedRows = rows
    ? rows.filter((row, index) => row.status === "valid" && checked[`${row.hash}:${index}`])
    : [];
  const selectedCount = selectedRows.length;

  async function handleCommit() {
    if (!rows) return;
    setError("");
    setCommitting(true);

    try {
      const response = await commitImportAction({
        accountId: Number(accountId),
        rows: selectedRows.map(toCommitRow),
      });
      setResult(response);
      setRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div>
      {!rows && !result && (
        <form className={styles.form} onSubmit={handlePreview}>
          <div className={styles.field}>
            <label htmlFor="importAccountId">Account</label>
            <select
              id="importAccountId"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="importFile">CSV file</label>
            <input
              id="importFile"
              type="file"
              accept=".csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <p className={styles.caveat}>
            Duplicate detection only checks this account — importing the same
            statement into a different account will not be flagged.
          </p>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.previewButton} disabled={previewing}>
            {previewing ? "Reading…" : "Preview"}
          </button>
        </form>
      )}

      {rows && (
        <div>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rowKey = `${row.hash}:${index}`;
                  return (
                    <tr key={rowKey}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.status === "valid" && !!checked[rowKey]}
                          disabled={row.status !== "valid"}
                          onChange={(event) =>
                            setChecked((prev) => ({ ...prev, [rowKey]: event.target.checked }))
                          }
                        />
                      </td>
                      <td>
                        {row.occurred_on ?? "—"}
                        {row.backdated && (
                          <span className={styles.backdatedBadge} title="Before this account's opening balance — will import but won't change the current balance.">
                            Before opening balance
                          </span>
                        )}
                      </td>
                      <td>{row.description}</td>
                      <td>{row.type ?? "—"}</td>
                      <td>{row.amount ?? "—"}</td>
                      <td>{row.category ?? "—"}</td>
                      <td>
                        <span
                          className={
                            row.status === "valid" ? styles.statusValid : styles.statusOther
                          }
                        >
                          {row.reason ?? row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className={styles.commitButton}
            onClick={handleCommit}
            disabled={committing || selectedCount === 0}
          >
            {committing ? "Importing…" : "Commit selected"}
          </button>
          {selectedCount === 0 && <p className={styles.caveat}>Nothing selected to import.</p>}
        </div>
      )}

      {result && (
        <div>
          <p className={styles.success}>
            Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}.
            {result.skipped_duplicates > 0
              ? ` Skipped ${result.skipped_duplicates} duplicate${result.skipped_duplicates === 1 ? "" : "s"}.`
              : ""}
          </p>
          <button type="button" className={styles.previewButton} onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

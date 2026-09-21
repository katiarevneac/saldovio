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
      for (const row of response.rows) {
        initialChecked[row.hash] = row.status === "valid";
      }
      setChecked(initialChecked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setRows(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    setError("");
    setCommitting(true);

    const selectedRows = rows.filter((row) => row.status === "valid" && checked[row.hash]);

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
                {rows.map((row) => (
                  <tr key={row.hash}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.status === "valid" && !!checked[row.hash]}
                        disabled={row.status !== "valid"}
                        onChange={(event) =>
                          setChecked((prev) => ({ ...prev, [row.hash]: event.target.checked }))
                        }
                      />
                    </td>
                    <td>{row.occurred_on ?? "—"}</td>
                    <td>{row.description}</td>
                    <td>{row.type ?? "—"}</td>
                    <td>{row.amount ?? "—"}</td>
                    <td>{row.category ?? "—"}</td>
                    <td>
                      <span
                        className={row.status === "valid" ? styles.statusValid : styles.statusOther}
                      >
                        {row.reason ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className={styles.commitButton}
            onClick={handleCommit}
            disabled={committing}
          >
            {committing ? "Importing…" : "Commit selected"}
          </button>
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

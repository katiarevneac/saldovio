import { describe, expect, it } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import TransactionsExplorer from "./TransactionsExplorer";
import type { Transaction } from "@/lib/transactions";

const transactions: Transaction[] = [
  { id: 1, account_id: 1, type: "expense", amount: "-150.00", occurred_on: "2026-09-14", category: "Transport" },
  { id: 2, account_id: 2, type: "expense", amount: "-187.00", occurred_on: "2026-09-14", category: "Groceries" },
  { id: 3, account_id: 1, type: "income", amount: "500.00", occurred_on: "2026-09-01", category: null },
];

const accountNameById = { 1: "Revolut", 2: "ING" };

describe("TransactionsExplorer", () => {
  it("renders every transaction by default", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    expect(screen.getAllByRole("row")).toHaveLength(4); // 3 data rows + header row
  });

  it("narrows rows by search text matched against category/type", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), {
      target: { value: "groc" },
    });
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Groceries")).toBeInTheDocument();
  });

  it("narrows rows by clicking a category chip, and resets on All", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    fireEvent.click(screen.getByRole("button", { name: "Transport" }));
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 match

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("groups rows under date headings in 'by day' density", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    fireEvent.click(screen.getByRole("button", { name: "By day" }));
    expect(screen.getByRole("heading", { name: "2026-09-14" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2026-09-01" })).toBeInTheDocument();
  });

  it("shows an empty state when no transaction matches the filters", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), {
      target: { value: "nothing matches this" },
    });
    expect(screen.getByText("No transactions match your filters.")).toBeInTheDocument();
  });

  it("shows a true-empty state distinct from the no-matches state when there are no transactions at all", () => {
    render(<TransactionsExplorer transactions={[]} accountNameById={accountNameById} />);
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    expect(screen.queryByText("No transactions match your filters.")).not.toBeInTheDocument();
  });

  it("groups rows under h2 date headings in 'by day' density (heading outline continuity)", () => {
    render(<TransactionsExplorer transactions={transactions} accountNameById={accountNameById} />);
    fireEvent.click(screen.getByRole("button", { name: "By day" }));
    expect(screen.getByRole("heading", { level: 2, name: "2026-09-14" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "2026-09-01" })).toBeInTheDocument();
  });
});

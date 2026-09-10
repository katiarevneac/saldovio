# Overview Reskin (Epic 8 Story 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Overview page (`web/app/(dashboard)/page.tsx`) onto the dark/lime token set from Story 1: KPI cards (total balance, income/expenses/surplus this month), a recurring-rules card, condensed accounts and recent-transactions cards, the existing forecast summary restyled into a card, and a non-interactive simulator placeholder card.

**Architecture:** A new reusable `KpiCard` component (icon + label + amount + optional caption) renders the four top-of-page metrics. A new pure function `computeMonthlyTotals` (in `web/lib/overview-metrics.ts`) derives this-month income/expense/surplus from the already-fetched transaction list — no new Finance API endpoint, no new request shape. The Overview page itself is rewritten to fetch `getTransactions()` (not fetched here before), compute the monthly totals, and render every section as a `.card`-styled block using Story 1's global tokens/utilities. The forecast section keeps its exact existing data and logic (no chart yet — that's Story 9/10) and the simulator section is a genuinely non-interactive placeholder (no fake data, no working slider — that's Story 11/12), both restyled only. `(dashboard)/layout.module.css` gets the outer padding Story 2 deferred to this story, applied at the shared `.main` level so it benefits `/transactions` and `/accounts` too even though their own internal reskin is still Story 5/6.

**Tech Stack:** Next.js 16 Server Components, CSS Modules composing Story 1's global `.card`/`.tabularNums` classes and CSS custom properties, Vitest + jsdom + `@testing-library/react` (already set up).

## Global Constraints

- Forecast card shows the existing numeric forecast summary only (balance, calculation date, window end date, formula version, assumptions) — no chart. `ForecastChart` doesn't exist until Story 9/10.
- Simulator card is a genuinely non-interactive placeholder: dashed border, tertiary text color, no input, no slider, no fake numbers. Exact copy: `"Can I afford it?" scenario planning is coming in a later story.` — the real engine is Story 11/12. This was a deliberate decision (confirmed with the user over the alternative of reordering the epic or shipping fake data) rather than an oversight — do not "improve" it with placeholder data.
- No Import CSV button anywhere on this page, not even disabled. CSV import (sub-project 5) is fully out of this epic's scope; do not add a stand-in for it.
- The hero section shows title + subtitle text only — no "+ Add transaction" button in the hero row. The working add-transaction entry point remains the existing inline `TransactionForm`, in its own card further down the page, unchanged in behavior. Story 4 replaces this with a modal trigger; do not build modal-opening logic here.
- Transaction amounts are signed at the source (income positive, expense negative — confirmed via `web/components/TransactionForm.tsx`'s `signedAmount` logic). `computeMonthlyTotals` must exclude `type === "transfer"` from both income and expense sums (brief §11 rule 1 — a transfer is never income or expense).
- Reuse Story 1's exact token names — do not invent new ones: `--color-accent`, `--color-accent-tint-bg`, `--color-expense-tint-bg`, `--color-expense-tint-icon`, `--color-text-secondary`, `--color-text-tertiary`, `--color-verdict-no`, `--radius-card`, `--space-gap`, `--space-card-padding`, `--font-archivo`.
- `formatAmountValue` (new, in `web/lib/money.ts`) is a narrower helper than the existing `formatAmount` — it returns just the locale-formatted number (no "RON", no currency symbol), for KPI cards that render "RON" and the number as separate typographic elements per the design handoff. `formatAmount` itself is untouched and keeps every existing caller (recurring rules, condensed accounts, condensed transactions, forecast balance).
- No retroactive tests for `toBani`, `formatAmount`, or `baniToDecimalString` — this story doesn't change their behavior. Only the new `formatAmountValue` gets a spec file.
- `(dashboard)/layout.module.css`'s `.main` gets padding added here (explicitly deferred from Story 2's own review notes: "the two new pages render unpadded... until Story 3 restyles `.main`"). This changes outer spacing on `/transactions` and `/accounts` too, as a side effect of the shared layout — their own internal content restyle is still out of scope here (Stories 5/6).
- Vitest date-dependent assertions (anything relying on "this month") must pin the system clock with `vi.useFakeTimers()`/`vi.setSystemTime()` — the current date is not fixed at test-run time, only in this project's own conversational context.

---

## Task 1: `formatAmountValue` helper + `KpiCard` component

**Files:**
- Modify: `web/lib/money.ts`
- Create: `web/lib/money.spec.ts`
- Create: `web/components/KpiCard.tsx`
- Create: `web/components/KpiCard.module.css`
- Create: `web/components/KpiCard.spec.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task of this story).
- Produces: `formatAmountValue(bani: number): string` from `web/lib/money.ts`, and `KpiCard` from `web/components/KpiCard.tsx` with props `{ icon: React.ReactNode; label: string; amountBani: number; caption?: string; variant?: "accent" | "expense" }` — both consumed by Task 3's Overview page rewrite.

- [ ] **Step 1: Write the failing test for `formatAmountValue`**

Create `web/lib/money.spec.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatAmountValue } from "./money";

describe("formatAmountValue", () => {
  it("formats a positive amount with two decimals and RO grouping", () => {
    expect(formatAmountValue(2485000)).toBe("24.850,00");
  });

  it("formats zero", () => {
    expect(formatAmountValue(0)).toBe("0,00");
  });

  it("formats a negative amount with a leading minus sign", () => {
    expect(formatAmountValue(-735000)).toBe("-7.350,00");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- money.spec` (from `web/`)
Expected: FAIL — `formatAmountValue` is not exported yet.

- [ ] **Step 3: Add `formatAmountValue` to `web/lib/money.ts`**

Add this function to the existing file (do not modify `toBani`, `formatAmount`, or `baniToDecimalString`):
```ts
// Same locale/rounding convention as formatAmount, but without the "RON"
// currency symbol — for layouts (KPI cards) that render "RON" and the
// number as separate typographic elements.
export function formatAmountValue(bani: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bani / 100);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- money.spec` (from `web/`)
Expected: PASS. (These exact strings were verified against this machine's actual Node ICU output before writing this plan — Node v26.5.0.)

- [ ] **Step 5: Write the failing test for `KpiCard`**

Create `web/components/KpiCard.spec.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("renders label, formatted amount, and caption", () => {
    render(
      <KpiCard
        icon={<svg data-testid="icon" />}
        label="Total balance"
        amountBani={2485000}
        caption="Sum of 4 accounts"
      />
    );

    expect(screen.getByText("Total balance")).toBeInTheDocument();
    expect(screen.getByText("24.850,00")).toBeInTheDocument();
    expect(screen.getByText("Sum of 4 accounts")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders without a caption", () => {
    render(<KpiCard icon={<svg />} label="Monthly surplus" amountBani={0} />);

    expect(screen.getByText("Monthly surplus")).toBeInTheDocument();
    expect(screen.queryByText(/Sum of/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- KpiCard.spec` (from `web/`)
Expected: FAIL — `./KpiCard` does not exist yet.

- [ ] **Step 7: Create `web/components/KpiCard.module.css`**

```css
.card {
  composes: card from global;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
}

.iconAccent,
.iconExpense {
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.iconAccent {
  background: var(--color-accent-tint-bg);
  color: var(--color-accent);
}

.iconExpense {
  background: var(--color-expense-tint-bg);
  color: var(--color-expense-tint-icon);
}

.body {
  min-width: 0;
}

.label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.amountRow {
  composes: tabularNums from global;
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-wrap: nowrap;
}

.currency {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.amount {
  font-weight: 800;
  font-size: 26px;
  letter-spacing: -0.03em;
}

.caption {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  margin-top: 5px;
}
```

- [ ] **Step 8: Create `web/components/KpiCard.tsx`**

```tsx
import type { ReactNode } from "react";
import { formatAmountValue } from "@/lib/money";
import styles from "./KpiCard.module.css";

type KpiCardProps = {
  icon: ReactNode;
  label: string;
  amountBani: number;
  caption?: string;
  variant?: "accent" | "expense";
};

export default function KpiCard({
  icon,
  label,
  amountBani,
  caption,
  variant = "accent",
}: KpiCardProps) {
  return (
    <div className={styles.card}>
      <span className={variant === "expense" ? styles.iconExpense : styles.iconAccent}>
        {icon}
      </span>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={styles.amountRow}>
          <span className={styles.currency}>RON</span>
          <span className={styles.amount}>{formatAmountValue(amountBani)}</span>
        </div>
        {caption ? <div className={styles.caption}>{caption}</div> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- KpiCard.spec` (from `web/`)
Expected: PASS.

- [ ] **Step 10: Run the full suite and typecheck**

Run: `npm test` then `npx tsc --noEmit` (from `web/`)
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add web/lib/money.ts web/lib/money.spec.ts web/components/KpiCard.tsx web/components/KpiCard.module.css web/components/KpiCard.spec.tsx
git commit -m "feat: add formatAmountValue helper and KpiCard component"
```

---

## Task 2: `computeMonthlyTotals` / `currentYearMonth` (overview metrics)

**Files:**
- Create: `web/lib/overview-metrics.ts`
- Create: `web/lib/overview-metrics.spec.ts`

**Interfaces:**
- Consumes: `Transaction` type from `web/lib/transactions.ts` (unchanged), `toBani` from `web/lib/money.ts` (unchanged).
- Produces: `computeMonthlyTotals(transactions: Transaction[], yearMonth: string): { incomeBani: number; expenseBani: number; surplusBani: number }` and `currentYearMonth(): string` (format `YYYY-MM`, local calendar date) — both consumed by Task 3's Overview page rewrite.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/overview-metrics.spec.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeMonthlyTotals, currentYearMonth } from "./overview-metrics";
import type { Transaction } from "./transactions";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    account_id: 1,
    type: "income",
    amount: "0.00",
    occurred_on: "2026-09-01",
    category: null,
    ...overrides,
  };
}

describe("computeMonthlyTotals", () => {
  it("sums income and expense transactions within the given month", () => {
    const transactions = [
      tx({ id: 1, type: "income", amount: "1200.00", occurred_on: "2026-09-05" }),
      tx({ id: 2, type: "expense", amount: "-350.50", occurred_on: "2026-09-12" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result.incomeBani).toBe(120000);
    expect(result.expenseBani).toBe(-35050);
    expect(result.surplusBani).toBe(84950);
  });

  it("excludes transactions outside the given month", () => {
    const transactions = [
      tx({ id: 1, type: "income", amount: "500.00", occurred_on: "2026-08-31" }),
      tx({ id: 2, type: "income", amount: "500.00", occurred_on: "2026-10-01" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });

  it("excludes transfers from income and expense totals", () => {
    const transactions = [
      tx({ id: 1, type: "transfer", amount: "-1000.00", occurred_on: "2026-09-10" }),
    ];

    const result = computeMonthlyTotals(transactions, "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });

  it("returns all-zero totals when there are no transactions", () => {
    const result = computeMonthlyTotals([], "2026-09");

    expect(result).toEqual({ incomeBani: 0, expenseBani: 0, surplusBani: 0 });
  });
});

describe("currentYearMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the local year and month, zero-padded", () => {
    vi.setSystemTime(new Date(2026, 2, 15));

    expect(currentYearMonth()).toBe("2026-03");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- overview-metrics.spec` (from `web/`)
Expected: FAIL — `./overview-metrics` does not exist yet.

- [ ] **Step 3: Create `web/lib/overview-metrics.ts`**

```ts
import type { Transaction } from "./transactions";
import { toBani } from "./money";

export type MonthlyTotals = {
  incomeBani: number;
  expenseBani: number;
  surplusBani: number;
};

// Excludes transfers — a transfer between the user's own accounts is
// never income or expense at the aggregate level (brief §11 rule 1).
export function computeMonthlyTotals(
  transactions: Transaction[],
  yearMonth: string
): MonthlyTotals {
  let incomeBani = 0;
  let expenseBani = 0;

  for (const transaction of transactions) {
    if (transaction.type === "transfer") continue;
    if (!transaction.occurred_on.startsWith(yearMonth)) continue;

    const bani = toBani(transaction.amount);
    if (transaction.type === "income") {
      incomeBani += bani;
    } else {
      expenseBani += bani;
    }
  }

  return {
    incomeBani,
    expenseBani,
    surplusBani: incomeBani + expenseBani,
  };
}

// Local calendar date, matching the convention already used by
// web/lib/analytics.ts's todayDateString (getFullYear/getMonth/getDate,
// not toISOString/UTC).
export function currentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- overview-metrics.spec` (from `web/`)
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test` then `npx tsc --noEmit` (from `web/`)
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/overview-metrics.ts web/lib/overview-metrics.spec.ts
git commit -m "feat: add computeMonthlyTotals and currentYearMonth for the Overview KPI cards"
```

---

## Task 3: Overview page rewrite + shared layout padding

**Files:**
- Modify: `web/app/(dashboard)/page.tsx`
- Modify: `web/app/(dashboard)/page.module.css`
- Modify: `web/app/(dashboard)/page.spec.tsx`
- Modify: `web/app/(dashboard)/layout.module.css`

**Interfaces:**
- Consumes: `KpiCard` and `formatAmountValue`-backed KPI cards from Task 1; `computeMonthlyTotals`/`currentYearMonth` from Task 2; existing `getMyAccounts`, `getMyRecurringRules`, `getTransactions`, `getForecast`, `toBani`, `baniToDecimalString`, `formatAmount`, `TransactionForm` (all unchanged).
- Produces: nothing consumed by a later task in this story (last task).

- [ ] **Step 1: Write the failing/updated tests for the Overview page**

Replace `web/app/(dashboard)/page.spec.tsx` entirely with:
```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: authMock,
}));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const { getMyAccountsMock } = vi.hoisted(() => ({
  getMyAccountsMock: vi.fn(),
}));
vi.mock("@/lib/accounts", () => ({
  getMyAccounts: getMyAccountsMock,
}));

const { getMyRecurringRulesMock } = vi.hoisted(() => ({
  getMyRecurringRulesMock: vi.fn(),
}));
vi.mock("@/lib/recurring-rules", () => ({
  getMyRecurringRules: getMyRecurringRulesMock,
}));

const { getTransactionsMock } = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
}));
vi.mock("@/lib/transactions", () => ({
  getTransactions: getTransactionsMock,
}));

const { getForecastMock } = vi.hoisted(() => ({
  getForecastMock: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  getForecast: getForecastMock,
}));

// TransactionForm (rendered inside DashboardPage's JSX) statically imports
// "@/app/actions", which imports "@/lib/internal-auth" (`import
// "server-only"`). Mocking the action module keeps that real server-only
// code out of the test's module graph — same pattern as before this story.
vi.mock("@/app/actions", () => ({
  createTransactionAction: vi.fn(),
  createAccountAction: vi.fn(),
  createRecurringRuleAction: vi.fn(),
}));

import DashboardPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
  getMyRecurringRulesMock.mockReset();
  getTransactionsMock.mockReset();
  getForecastMock.mockReset();

  authMock.mockResolvedValue({
    user: { id: "1", email: "test@example.com" },
  });
  getMyRecurringRulesMock.mockResolvedValue([]);
  getForecastMock.mockResolvedValue({
    forecastBalance: "0.00",
    calculationDate: "2026-09-10",
    windowEndDate: "2026-10-10",
    formulaVersion: "1",
    assumptions: [],
  });
});

describe("DashboardPage", () => {
  it("redirects to /login and skips data fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).not.toHaveBeenCalled();
  });

  it("renders KPI cards computed from accounts and this month's transactions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    try {
      getMyAccountsMock.mockResolvedValue([
        {
          id: 1,
          name: "Cont curent",
          current_balance: "0.00",
          reference_date: "2026-01-01",
          balance: "1000.00",
        },
      ]);
      getTransactionsMock.mockResolvedValue([
        { id: 1, account_id: 1, type: "income", amount: "500.00", occurred_on: "2026-09-05", category: "Salary" },
        { id: 2, account_id: 1, type: "expense", amount: "-200.00", occurred_on: "2026-09-06", category: "Groceries" },
        { id: 3, account_id: 1, type: "income", amount: "999.00", occurred_on: "2026-01-01", category: "Old" },
      ]);

      const ui = await DashboardPage();
      render(ui);

      expect(screen.getByText("Total balance")).toBeInTheDocument();
      expect(screen.getByText("Income this month")).toBeInTheDocument();
      expect(screen.getByText("500,00")).toBeInTheDocument();
      expect(screen.getByText("Expenses this month")).toBeInTheDocument();
      expect(screen.getByText("200,00")).toBeInTheDocument();
      expect(screen.getByText("Monthly surplus")).toBeInTheDocument();
      expect(screen.getByText("300,00")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows up to 3 condensed accounts with a link to the full list", async () => {
    getMyAccountsMock.mockResolvedValue([
      { id: 1, name: "A1", current_balance: "0.00", reference_date: "2026-01-01", balance: "10.00" },
      { id: 2, name: "A2", current_balance: "0.00", reference_date: "2026-01-01", balance: "20.00" },
      { id: 3, name: "A3", current_balance: "0.00", reference_date: "2026-01-01", balance: "30.00" },
      { id: 4, name: "A4", current_balance: "0.00", reference_date: "2026-01-01", balance: "40.00" },
    ]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A3")).toBeInTheDocument();
    expect(screen.queryByText("A4")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all accounts" })
    ).toHaveAttribute("href", "/accounts");
  });

  it("shows up to 5 condensed recent transactions with a link to the full list", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        account_id: 1,
        type: "expense" as const,
        amount: "-10.00",
        occurred_on: `2026-09-0${i + 1}`,
        category: `Tx${i + 1}`,
      }))
    );

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Tx6$/)).toBeInTheDocument();
    expect(screen.queryByText(/Tx1$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all transactions" })
    ).toHaveAttribute("href", "/transactions");
  });

  it("renders the simulator placeholder card", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText("Simulator")).toBeInTheDocument();
    expect(screen.getByText(/coming in a later story/)).toBeInTheDocument();
  });

  it("shows a forecast-unavailable message without crashing when Analytics Service fails", async () => {
    getMyAccountsMock.mockResolvedValue([]);
    getTransactionsMock.mockResolvedValue([]);
    getForecastMock.mockRejectedValue(new Error("network error"));

    const ui = await DashboardPage();
    render(ui);

    expect(screen.getByText(/Forecast unavailable right now/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- "app/(dashboard)/page.spec"` (from `web/`, parens quoted — no backslash escapes, double quotes alone protect them in bash)
Expected: FAIL — current `page.tsx` doesn't fetch transactions, doesn't render KPI cards, doesn't render condensed lists or a simulator placeholder.

- [ ] **Step 3: Rewrite `web/app/(dashboard)/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getTransactions } from "@/lib/transactions";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString, formatAmount } from "@/lib/money";
import { computeMonthlyTotals, currentYearMonth } from "@/lib/overview-metrics";
import KpiCard from "@/components/KpiCard";
import TransactionForm from "@/components/TransactionForm";
import { auth } from "@/auth";
import styles from "./page.module.css";

function WalletIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

function TrendingDownIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules, transactions] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
    getTransactions(),
  ]);

  const totalBani = accounts.reduce((sum, account) => sum + toBani(account.balance), 0);
  const monthly = computeMonthlyTotals(transactions, currentYearMonth());

  let forecast: Forecast | null = null;
  let forecastError = false;
  try {
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules);
  } catch {
    forecastError = true;
  }

  const recentTransactions = [...transactions]
    .sort((a, b) =>
      a.occurred_on === b.occurred_on
        ? b.id - a.id
        : a.occurred_on < b.occurred_on
          ? 1
          : -1
    )
    .slice(0, 5);

  const condensedAccounts = accounts.slice(0, 3);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Your money, in perspective.</h1>
        <p className={styles.heroSub}>A clearer view of today. A plan for tomorrow.</p>
      </div>

      <div className={styles.kpiGrid}>
        <KpiCard
          icon={<WalletIcon />}
          label="Total balance"
          amountBani={totalBani}
          caption={`Sum of ${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          icon={<TrendingUpIcon />}
          label="Income this month"
          amountBani={monthly.incomeBani}
          caption="Confirmed transactions this month."
        />
        <KpiCard
          icon={<TrendingDownIcon />}
          label="Expenses this month"
          amountBani={Math.abs(monthly.expenseBani)}
          caption="Confirmed transactions this month."
          variant="expense"
        />
        <KpiCard
          icon={<BarChartIcon />}
          label="Monthly surplus"
          amountBani={monthly.surplusBani}
          caption="Confirmed income minus spending."
        />
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Recurring rules</h2>
          <Link href="/recurring-rules/new" className={styles.cardLink}>
            Add recurring rule
          </Link>
        </div>
        {recurringRules.length === 0 ? (
          <p className={styles.emptyState}>No recurring rules yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {recurringRules.map((rule) => (
              <li key={rule.id} className={styles.condensedRow}>
                <span>
                  {rule.category ?? rule.type} — day {rule.day_of_month}
                </span>
                <span className={styles.tabularNums}>
                  {formatAmount(toBani(rule.amount) * (rule.type === "expense" ? -1 : 1))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Accounts</h2>
          <Link href="/accounts" className={styles.cardLink}>
            View all accounts
          </Link>
        </div>
        {condensedAccounts.length === 0 ? (
          <p className={styles.emptyState}>No accounts yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {condensedAccounts.map((account) => (
              <li key={account.id} className={styles.condensedRow}>
                <span>{account.name}</span>
                <span className={styles.tabularNums}>{formatAmount(toBani(account.balance))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Recent transactions</h2>
          <Link href="/transactions" className={styles.cardLink}>
            View all transactions
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <p className={styles.emptyState}>No transactions yet.</p>
        ) : (
          <ul className={styles.condensedList}>
            {recentTransactions.map((transaction) => (
              <li key={transaction.id} className={styles.condensedRow}>
                <span>
                  {transaction.occurred_on} — {transaction.category ?? transaction.type}
                </span>
                <span className={styles.tabularNums}>{formatAmount(toBani(transaction.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>30-day forecast</h2>
        {forecast ? (
          <>
            <p className={styles.forecastBalance}>{formatAmount(toBani(forecast.forecastBalance))}</p>
            <p className={styles.forecastMeta}>
              As of {forecast.calculationDate}, through {forecast.windowEndDate} (formula v
              {forecast.formulaVersion})
            </p>
            <ul className={styles.forecastAssumptions}>
              {forecast.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </>
        ) : forecastError ? (
          <p className={styles.error}>
            Forecast unavailable right now — Analytics Service could not be reached. Your balance
            and transactions above are unaffected.
          </p>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.simulatorPlaceholder}`}>
        <h2 className={styles.cardTitle}>Simulator</h2>
        <p className={styles.placeholderText}>
          &ldquo;Can I afford it?&rdquo; scenario planning is coming in a later story.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Add transaction</h2>
        <TransactionForm accounts={accounts} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/app/(dashboard)/page.module.css`**

```css
.page {
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  gap: var(--space-gap);
}

.hero {
  padding: 0 0 6px;
}

.heroTitle {
  font-size: 32px;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}

.heroSub {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.kpiGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-gap);
}

.card {
  composes: card from global;
}

.cardHeader {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.cardTitle {
  margin: 0;
  font-size: 19px;
}

.cardLink {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.cardLink:hover {
  color: var(--color-text-primary);
}

.emptyState {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.condensedList {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.condensedRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13.5px;
}

.tabularNums {
  composes: tabularNums from global;
  font-weight: 700;
}

.forecastBalance {
  font-weight: 800;
  font-size: 26px;
  letter-spacing: -0.03em;
  margin-top: 4px;
}

.forecastMeta {
  font-size: 12.5px;
  color: var(--color-text-secondary);
  margin: 6px 0 0;
}

.forecastAssumptions {
  font-size: 11.5px;
  color: var(--color-text-tertiary);
  padding-left: 18px;
  margin: 10px 0 0;
  line-height: 1.6;
}

.error {
  color: var(--color-verdict-no);
  font-size: 13px;
}

.simulatorPlaceholder {
  border-style: dashed;
}

.simulatorPlaceholder .cardTitle,
.placeholderText {
  color: var(--color-text-tertiary);
}

.placeholderText {
  font-size: 13px;
  margin: 0;
}
```

- [ ] **Step 5: Add outer padding to `web/app/(dashboard)/layout.module.css`'s `.main`**

Modify only the `.main` rule (leave `.shell`, `.header`, `.header form`, `.sessionEmail` untouched):
```css
.main {
  flex: 1;
  min-width: 0;
  padding: 20px 24px 48px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- "app/(dashboard)/page.spec"` (from `web/`)
Expected: PASS.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test` then `npx tsc --noEmit` (from `web/`)
Expected: all PASS, no type errors.

- [ ] **Step 8: Manual verification in the browser**

Run `npm run dev` (needs `finance-api` and `analytics-service` running too — see `CLAUDE.md`'s dev-environment notes). Log in, load `/`: confirm 4 KPI cards render with correct RON amounts, recurring rules/accounts/transactions condensed cards each show at most their cap (3/∞/5) plus a working "View all..." link, the forecast card shows real numbers (or the unavailable message if Analytics Service is stopped), and the simulator card renders as a visibly muted, non-interactive placeholder. Confirm `/transactions` and `/accounts` now have outer padding matching `/`'s.

- [ ] **Step 9: Commit**

```bash
git add web/app/\(dashboard\)/page.tsx web/app/\(dashboard\)/page.module.css web/app/\(dashboard\)/page.spec.tsx web/app/\(dashboard\)/layout.module.css
git commit -m "feat: reskin Overview with KPI cards, condensed lists, and a simulator placeholder"
```

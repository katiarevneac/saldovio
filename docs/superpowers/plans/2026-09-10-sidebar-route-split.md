# Sidebar Nav + Route Split (Epic 8 Story 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single dashboard page into three real routes (`/`, `/transactions`, `/accounts`) behind a shared sidebar, matching the design handoff's navigation structure, with Forecast/Simulator/Settings present but disabled until their own stories build them.

**Architecture:** A Next.js route group, `web/app/(dashboard)/`, holds all three pages and a nested layout that renders `Sidebar` + `children` — route groups are stripped from the URL, so `/` stays `/`, and `/login`/`/signup` (outside the group) never get the sidebar. `Sidebar` is a small client component (`usePathname` for active-route detection) with two structurally different list-item kinds: real `Link`s for the three built routes, and `aria-disabled="true"` plain list items for the three not-yet-built ones — this is what makes "disabled" testable and accessible rather than a `Link` with a disabled *style* someone could still click. The existing dashboard's transactions table and accounts list move to their own pages verbatim (markup and CSS relocated, not rewritten) — visual reskin of page content is Story 3 (Overview)/5 (Transactions)/6 (Accounts)'s job, not this one.

**Tech Stack:** Next.js 16.3.4 App Router (route groups, nested layouts), `next-auth` v5 (`auth()` per Server Component, matching the layer-2 pattern from Epic 7 Story 3), Vitest + jsdom + `@testing-library/react`.

## Global Constraints

- Route group name: `web/app/(dashboard)/`. It holds `page.tsx` (Overview, moved from `web/app/page.tsx`), `transactions/page.tsx`, `accounts/page.tsx`, and the group's own `layout.tsx`. `login`/`signup` stay outside the group at `web/app/login/`, `web/app/signup/` — unchanged, no sidebar.
- The group's `layout.tsx` uses plain `{ children }: { children: React.ReactNode }` typing — do NOT use Next's generated `LayoutProps<...>` helper here. Epic 8 Story 1 hit a real bug from assuming a generated route-prop type required more than it did; a nested layout with no dynamic segments doesn't need that machinery at all, and reaching for it again risks the same mistake.
- Every Server Component in the new pages repeats the exact layer-2 gate already used in `page.tsx`: `const session = await auth(); if (!session?.user) { redirect("/login"); }`, called before any data fetch. This is deliberate repetition, not an oversight — Epic 7 Story 3's final review found a real information-disclosure gap from a Server Component that skipped this, and CLAUDE.md's security rules require server-side ownership checks on every data access, not just the routes someone remembered to gate.
- Layer 1 (`web/lib/route-protection.ts`'s `isPathAuthorized`) needs no production code change — it already default-denies any path not in `PUBLIC_PATHS = ["/login", "/signup"]`, so `/transactions` and `/accounts` are protected automatically. Add test cases proving this rather than treating it as already covered by inspection.
- `Sidebar`'s active-route indicator is `aria-current="page"` on the `Link`, not a CSS-module class name — CSS Modules hash class names under Vite/Vitest, making `toHaveClass("itemActive")`-style assertions fragile. Disabled items get `aria-disabled="true"` on a plain `<li>` (no `href`, not a `Link`, not focusable) — not a `Link` styled to look disabled, which would still be clickable/focusable.
- No visual reskin of page *content* in this story — Overview's remaining sections, the new Transactions table, and the new Accounts list use the markup and (mostly hardcoded-color) CSS they already have today, just relocated. Story 3 (Overview), Story 5 (Transactions filters/density), and Story 6 (Accounts summary/cards) own that work. The one exception is `Sidebar` itself, which is new and gets real styling now (colors/radius from Story 1's design tokens), since "sidebar nav" is this story's actual scope per the epic breakdown.
- The dashboard group's `<main>` wrapper gets no max-width/padding styling yet (`flex: 1; min-width: 0;` only) — the spec's ~1180px centered content width is deferred to Story 3, when `page.module.css`'s own container styling is rewritten anyway. Adding it now would nest two competing containers (the layout's and `page.module.css`'s existing `.page` class) for no benefit.
- Recurring rules stay on Overview exactly as they are today (confirmed with the user during Story 1's brainstorming) — not moved, not touched, in this story.
- `TransactionForm` and the "Add transaction" flow are untouched — Overview keeps rendering the form inline; the modal conversion is Story 4.
- Money/date handling is unaffected — no changes to `web/lib/money.ts`, `web/lib/transactions.ts`, or `web/lib/accounts.ts` in this story, only to what imports and renders them.

---

## Task 1: `Sidebar` component + `(dashboard)` route group scaffold

**Files:**
- Create: `web/components/Sidebar.tsx`
- Create: `web/components/Sidebar.module.css`
- Test: `web/components/Sidebar.spec.tsx`
- Create: `web/app/(dashboard)/layout.tsx`
- Create: `web/app/(dashboard)/layout.module.css`
- Move: `web/app/page.tsx` → `web/app/(dashboard)/page.tsx` (content unchanged in this task)
- Move: `web/app/page.module.css` → `web/app/(dashboard)/page.module.css` (content unchanged in this task)
- Move: `web/app/page.spec.tsx` → `web/app/(dashboard)/page.spec.tsx` (content unchanged in this task)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task of this plan).
- Produces: `Sidebar` (default export of `web/components/Sidebar.tsx`, no props) — imported by the group `layout.tsx` in this task, and by nothing else. `web/app/(dashboard)/` as the directory Tasks 2 and 3 add `transactions/` and `accounts/` subdirectories into.

- [ ] **Step 1: Write the failing tests for `Sidebar`**

Create `web/components/Sidebar.spec.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("renders a link with the correct href for each enabled nav item", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(
      screen.getByRole("link", { name: "Transactions" })
    ).toHaveAttribute("href", "/transactions");
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/accounts"
    );
  });

  it("marks the current route's link with aria-current, and no other link", () => {
    usePathnameMock.mockReturnValue("/transactions");
    render(<Sidebar />);

    expect(
      screen.getByRole("link", { name: "Transactions" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: "Accounts" })
    ).not.toHaveAttribute("aria-current");
  });

  it("renders Forecast, Simulator, and Settings as non-interactive, not as links", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Sidebar />);

    expect(
      screen.queryByRole("link", { name: "Forecast" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Simulator" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Settings" })
    ).not.toBeInTheDocument();

    expect(screen.getByText("Forecast")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByText("Simulator")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByText("Settings")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- Sidebar.spec` (from `web/`)
Expected: FAIL — `web/components/Sidebar.tsx` doesn't exist yet.

- [ ] **Step 3: Write `web/components/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Transactions", href: "/transactions" },
  { label: "Accounts", href: "/accounts" },
  { label: "Forecast", href: "/forecast", disabled: true },
  { label: "Simulator", href: "/simulator", disabled: true },
  { label: "Settings", href: "/settings", disabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) =>
          item.disabled ? (
            <li
              key={item.href}
              className={styles.itemDisabled}
              aria-disabled="true"
            >
              {item.label}
            </li>
          ) : (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.item}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Write `web/components/Sidebar.module.css`**

```css
.sidebar {
  width: 250px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: 20px 0;
}

.list {
  list-style: none;
}

.item {
  display: block;
  padding: 11px 14px;
  color: var(--color-text-secondary);
  border-radius: var(--radius-control);
}

.item:hover {
  color: var(--color-text-primary);
}

.item[aria-current="page"] {
  color: var(--color-accent-on);
  background: var(--color-accent);
  font-weight: 700;
}

.itemDisabled {
  display: block;
  padding: 11px 14px;
  color: var(--color-text-tertiary);
  cursor: default;
  opacity: 0.6;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- Sidebar.spec` (from `web/`)
Expected: 3 tests, PASS.

- [ ] **Step 6: Add layer-1 route-protection test coverage for the two new routes**

Modify `web/lib/route-protection.spec.ts` — add these 4 cases inside the existing `describe("isPathAuthorized", ...)` block, after the last existing `it`:
```typescript
  it("blocks an unauthenticated request to /transactions", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/transactions" })
    ).toBe(false);
  });

  it("allows an authenticated request to /transactions", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/transactions" })
    ).toBe(true);
  });

  it("blocks an unauthenticated request to /accounts", () => {
    expect(
      isPathAuthorized({ hasSession: false, pathname: "/accounts" })
    ).toBe(false);
  });

  it("allows an authenticated request to /accounts", () => {
    expect(
      isPathAuthorized({ hasSession: true, pathname: "/accounts" })
    ).toBe(true);
  });
```

Run: `npm test -- route-protection` (from `web/`)
Expected: 8 tests (4 existing + 4 new), PASS — no production code change needed, `isPathAuthorized` already default-denies anything not in `PUBLIC_PATHS`.

- [ ] **Step 7: Move the existing dashboard page into the route group**

Run from `web/`:
```bash
mkdir -p "app/(dashboard)"
git mv app/page.tsx "app/(dashboard)/page.tsx"
git mv app/page.module.css "app/(dashboard)/page.module.css"
git mv app/page.spec.tsx "app/(dashboard)/page.spec.tsx"
```

No content changes to any of the three moved files in this step — `git mv` only. All imports inside them use either relative paths within the same directory (`./page.module.css`, `./page`) or the `@/` alias (resolved from `web/`'s root via `tsconfig.json`, unaffected by directory nesting), so nothing needs editing.

- [ ] **Step 8: Write the route group's layout**

Create `web/app/(dashboard)/layout.tsx`:
```tsx
import Sidebar from "@/components/Sidebar";
import styles from "./layout.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
```

Create `web/app/(dashboard)/layout.module.css`:
```css
.shell {
  display: flex;
  min-height: 100%;
}

.main {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 9: Run the full test suite, typecheck, and build**

Run: `npm test`, then `npx tsc --noEmit`, then `npm run build` (from `web/`)
Expected: all tests PASS (including the moved `page.spec.tsx`, unchanged and still green); no type errors; build succeeds and lists `/`, `/login`, `/signup` among the compiled routes (confirms the route group didn't change the URL).

- [ ] **Step 10: Manual verification in the browser**

With `web/` and `finance-api/` dev servers running: visit `http://localhost:3001/login` — confirm no sidebar appears (outside the route group). Log in, visit `/` — confirm the sidebar appears on the left with 6 items, Overview/Transactions/Accounts as clickable links (Overview visually marked active), Forecast/Simulator/Settings visibly muted and not clickable. Clicking "Transactions" or "Accounts" will currently 404 — expected, those pages don't exist until Tasks 2 and 3.

- [ ] **Step 11: Commit**

```bash
git add web/components/Sidebar.tsx web/components/Sidebar.module.css web/components/Sidebar.spec.tsx web/lib/route-protection.spec.ts "web/app/(dashboard)"
git commit -m "feat: add Sidebar nav and (dashboard) route group scaffold"
```

---

## Task 2: `/transactions` page

**Files:**
- Create: `web/app/(dashboard)/transactions/page.tsx`
- Create: `web/app/(dashboard)/transactions/page.module.css`
- Test: `web/app/(dashboard)/transactions/page.spec.tsx`
- Modify: `web/app/(dashboard)/page.tsx`
- Modify: `web/app/(dashboard)/page.module.css`
- Modify: `web/app/(dashboard)/page.spec.tsx`

**Interfaces:**
- Consumes: the `(dashboard)` route group and its layout from Task 1 (no code-level dependency — `transactions/page.tsx` is a sibling `page.tsx` under the same group, picked up by the group's `layout.tsx` automatically).
- Produces: `TransactionsPage` (default export of `web/app/(dashboard)/transactions/page.tsx`), reachable at `/transactions`.

- [ ] **Step 1: Write the failing tests for `TransactionsPage`**

Create `web/app/(dashboard)/transactions/page.spec.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { getTransactionsMock } = vi.hoisted(() => ({
  getTransactionsMock: vi.fn(),
}));
vi.mock("@/lib/transactions", () => ({
  getTransactions: getTransactionsMock,
}));

import TransactionsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getTransactionsMock.mockReset();
});

describe("TransactionsPage", () => {
  it("redirects to /login and skips the fetch when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(TransactionsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getTransactionsMock).not.toHaveBeenCalled();
  });

  it("fetches transactions and does not redirect when a session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    getTransactionsMock.mockResolvedValue([]);

    await TransactionsPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- transactions/page.spec` (from `web/`)
Expected: FAIL — `web/app/(dashboard)/transactions/page.tsx` doesn't exist yet.

- [ ] **Step 3: Write `web/app/(dashboard)/transactions/page.tsx`**

This is the transactions table moved verbatim from the current `web/app/(dashboard)/page.tsx` (Task 1's moved copy) — same markup, same money handling, just its own page with its own layer-2 gate.

```tsx
import { redirect } from "next/navigation";
import { getTransactions } from "@/lib/transactions";
import { toBani, formatAmount } from "@/lib/money";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const transactions = await getTransactions();

  return (
    <div>
      <h1>Transactions</h1>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const bani = toBani(t.amount);
            return (
              <tr key={t.id}>
                <td>{t.occurred_on}</td>
                <td>{t.category ?? ""}</td>
                <td className={bani < 0 ? styles.expense : styles.income}>
                  {formatAmount(bani)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write `web/app/(dashboard)/transactions/page.module.css`**

These are the `.table`/`.income`/`.expense` rules moved out of `web/app/(dashboard)/page.module.css` (removed from there in Step 6 below) — not duplicated, relocated.

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.table th:last-child,
.table td:last-child {
  text-align: right;
}

.income {
  color: #1a7f37;
}

.expense {
  color: #b3261e;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- transactions/page.spec` (from `web/`)
Expected: 2 tests, PASS.

- [ ] **Step 6: Remove the table from Overview and link out instead**

Modify `web/app/(dashboard)/page.tsx` — replace the whole file with this content (removes the `getTransactions` import and call, removes the `<table>` section, replaces it with a link; everything else is unchanged from Task 1's moved copy):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { getMyRecurringRules } from "@/lib/recurring-rules";
import { getForecast, type Forecast } from "@/lib/analytics";
import { toBani, baniToDecimalString, formatAmount } from "@/lib/money";
import TransactionForm from "@/components/TransactionForm";
import { auth, signOut } from "@/auth";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, recurringRules] = await Promise.all([
    getMyAccounts(),
    getMyRecurringRules(),
  ]);
  const totalBani = accounts.reduce(
    (sum, account) => sum + toBani(account.balance),
    0
  );

  let forecast: Forecast | null = null;
  let forecastError = false;
  try {
    forecast = await getForecast(baniToDecimalString(totalBani), recurringRules);
  } catch {
    forecastError = true;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Saldovio</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <span className={styles.sessionEmail}>{session.user.email}</span>
          <button type="submit">Log out</button>
        </form>
      </header>

      <main>
        <section>
          <h2>Current balance</h2>
          <p className={styles.balance}>{formatAmount(totalBani)}</p>
        </section>

        <section>
          <h2>Accounts</h2>
          <ul className={styles.accountList}>
            {accounts.map((account) => (
              <li key={account.id}>
                {account.name}: {formatAmount(toBani(account.balance))}
              </li>
            ))}
          </ul>
          <Link href="/accounts/new">Add account</Link>
        </section>

        <section>
          <h2>Recurring rules</h2>
          <ul className={styles.accountList}>
            {recurringRules.map((rule) => (
              <li key={rule.id}>
                {rule.category ?? rule.type} — day {rule.day_of_month} —{" "}
                {formatAmount(
                  toBani(rule.amount) *
                    (rule.type === "expense" ? -1 : 1)
                )}
              </li>
            ))}
          </ul>
          <Link href="/recurring-rules/new">Add recurring rule</Link>
        </section>

        <section>
          <h2>30-day forecast</h2>
          {forecast ? (
            <>
              <p className={styles.balance}>
                {formatAmount(toBani(forecast.forecastBalance))}
              </p>
              <p className={styles.forecastMeta}>
                As of {forecast.calculationDate}, through{" "}
                {forecast.windowEndDate} (formula v{forecast.formulaVersion})
              </p>
              <ul className={styles.forecastAssumptions}>
                {forecast.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </>
          ) : forecastError ? (
            <p className={styles.error}>
              Forecast unavailable right now — Analytics Service could not
              be reached. Your balance and transactions above are
              unaffected.
            </p>
          ) : null}
        </section>

        <section>
          <h2>Add transaction</h2>
          <TransactionForm accounts={accounts} />
        </section>

        <section>
          <h2>Transactions</h2>
          <Link href="/transactions">View all transactions</Link>
        </section>
      </main>
    </div>
  );
}
```

Note that `TransactionForm` here still needs `accounts` — it's still fetched (used for the balance total and the form's account dropdown), only `transactions` was removed.

- [ ] **Step 7: Remove the now-unused table styles from Overview's CSS**

Modify `web/app/(dashboard)/page.module.css` — replace the whole file with this content (the `.table`, `.table th/td`, `.table th:last-child/td:last-child`, `.income`, and `.expense` rules are removed — moved to `transactions/page.module.css` in Step 4 — every other rule is unchanged):

```css
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sessionEmail {
  font-size: 0.875rem;
  color: #555;
}

.balance {
  font-size: 1.5rem;
  font-weight: bold;
}

.accountList {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.forecastMeta {
  font-size: 0.875rem;
  color: #555;
  margin: 0.25rem 0;
}

.forecastAssumptions {
  font-size: 0.8rem;
  color: #777;
  padding-left: 1.25rem;
  margin: 0.5rem 0 0;
}

.error {
  color: #b3261e;
  font-size: 0.875rem;
}
```

- [ ] **Step 8: Update Overview's test to drop the now-unused transactions mock**

Modify `web/app/(dashboard)/page.spec.tsx` — replace the whole file with this content (removes the `getTransactionsMock`/`vi.mock("@/lib/transactions", ...)` block and every reference to it; everything else is unchanged):

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: vi.fn(),
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

const { getForecastMock } = vi.hoisted(() => ({
  getForecastMock: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  getForecast: getForecastMock,
}));

// TransactionForm (rendered inside DashboardPage's JSX) statically imports
// "@/app/actions", which imports "@/lib/internal-auth" (`import
// "server-only"`). Next.js resolves that package's "react-server" export
// condition to a no-op at build time; plain Vitest has no such condition
// configured and resolves the throwing "default" export instead. Mocking
// the action module — same as every other data-layer import above — keeps
// that real server-only code out of the test's module graph.
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
  getForecastMock.mockReset();
});

describe("DashboardPage", () => {
  it("redirects to /login and skips data fetches when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
    expect(getMyRecurringRulesMock).not.toHaveBeenCalled();
  });

  it("fetches dashboard data and does not redirect when a session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    getMyAccountsMock.mockResolvedValue([]);
    getMyRecurringRulesMock.mockResolvedValue([]);
    getForecastMock.mockResolvedValue({
      forecastBalance: "0.00",
      calculationDate: "2026-09-10",
      windowEndDate: "2026-10-10",
      formulaVersion: "1",
      assumptions: [],
    });

    await DashboardPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getMyAccountsMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Add layer-1 route-protection coverage is already done (Task 1, Step 6) — run the full suite**

Run: `npm test`, then `npx tsc --noEmit` (from `web/`)
Expected: all tests PASS (Overview's 2 tests, Transactions' 2 new tests, Sidebar's 3, route-protection's 8, proxy's 2 — 17 total); no type errors.

- [ ] **Step 10: Manual verification in the browser**

With both dev servers running and logged in: click "View all transactions" on Overview — confirm `/transactions` renders the table with real data. Confirm Overview's own page no longer shows the full table.

- [ ] **Step 11: Commit**

```bash
git add "web/app/(dashboard)"
git commit -m "feat: add /transactions page, remove table from Overview"
```

---

## Task 3: `/accounts` page

**Files:**
- Create: `web/app/(dashboard)/accounts/page.tsx`
- Create: `web/app/(dashboard)/accounts/page.module.css`
- Test: `web/app/(dashboard)/accounts/page.spec.tsx`
- Modify: `web/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: the `(dashboard)` route group from Task 1; Task 2's version of `web/app/(dashboard)/page.tsx` (this task edits it further).
- Produces: `AccountsPage` (default export of `web/app/(dashboard)/accounts/page.tsx`), reachable at `/accounts`.

- [ ] **Step 1: Write the failing tests for `AccountsPage`**

Create `web/app/(dashboard)/accounts/page.spec.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { getMyAccountsMock } = vi.hoisted(() => ({
  getMyAccountsMock: vi.fn(),
}));
vi.mock("@/lib/accounts", () => ({
  getMyAccounts: getMyAccountsMock,
}));

import AccountsPage from "./page";

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMyAccountsMock.mockReset();
});

describe("AccountsPage", () => {
  it("redirects to /login and skips the fetch when there is no session", async () => {
    authMock.mockResolvedValue(null);

    await expect(AccountsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getMyAccountsMock).not.toHaveBeenCalled();
  });

  it("fetches accounts and does not redirect when a session exists", async () => {
    authMock.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    getMyAccountsMock.mockResolvedValue([]);

    await AccountsPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getMyAccountsMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- accounts/page.spec` (from `web/`)
Expected: FAIL — `web/app/(dashboard)/accounts/page.tsx` doesn't exist yet.

- [ ] **Step 3: Write `web/app/(dashboard)/accounts/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyAccounts } from "@/lib/accounts";
import { toBani, formatAmount } from "@/lib/money";
import { auth } from "@/auth";
import styles from "./page.module.css";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const accounts = await getMyAccounts();

  return (
    <div>
      <h1>Accounts</h1>
      <ul className={styles.list}>
        {accounts.map((account) => (
          <li key={account.id}>
            {account.name}: {formatAmount(toBani(account.balance))}
          </li>
        ))}
      </ul>
      <Link href="/accounts/new">Add account</Link>
    </div>
  );
}
```

- [ ] **Step 4: Write `web/app/(dashboard)/accounts/page.module.css`**

`.accountList` in `web/app/(dashboard)/page.module.css` stays there — it's still used by the Recurring Rules section on Overview, which this task does not touch. This is a small, deliberate duplication of the same list-reset rules under a different class name, not a shared import, since the two pages' lists will diverge in Stories 3 and 6 anyway.

```css
.list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- accounts/page.spec` (from `web/`)
Expected: 2 tests, PASS.

- [ ] **Step 6: Remove the account list from Overview and link out instead**

Modify `web/app/(dashboard)/page.tsx` — replace the "Accounts" section (currently the full `<ul>` of accounts plus the "Add account" link, right after the "Current balance" section) with:

```tsx
        <section>
          <h2>Accounts</h2>
          <Link href="/accounts">View all accounts</Link>
        </section>
```

`accounts` is still fetched via `getMyAccounts()` in the same `Promise.all` as before (Task 2 already reduced it to `[accounts, recurringRules]`) — it's still needed for `totalBani` and `TransactionForm`'s account dropdown, only the per-account `<ul>` listing and the "Add account" link (now on the new `/accounts` page instead) are removed from Overview. `Link` is already imported in this file (used elsewhere for `/recurring-rules/new` and, after this step, `/transactions` and `/accounts`).

- [ ] **Step 7: Run the full test suite, typecheck, and build**

Run: `npm test`, then `npx tsc --noEmit`, then `npm run build` (from `web/`)
Expected: all tests PASS (19 total: Overview's 2, Transactions' 2, Accounts' 2, Sidebar's 3, route-protection's 8, proxy's 2); no type errors; build succeeds and lists `/`, `/transactions`, `/accounts`, `/login`, `/signup` among the compiled routes.

- [ ] **Step 8: Manual verification in the browser**

With both dev servers running and logged in: click "View all accounts" on Overview — confirm `/accounts` renders the account list and "Add account" link with real data, and that creating a new account there still works (unchanged `/accounts/new` flow). Confirm Overview's own page no longer shows the full account list. Click each Sidebar item once more end-to-end: Overview, Transactions, Accounts all navigate correctly; Forecast/Simulator/Settings remain inert.

- [ ] **Step 9: Commit**

```bash
git add "web/app/(dashboard)"
git commit -m "feat: add /accounts page, remove account list from Overview"
```

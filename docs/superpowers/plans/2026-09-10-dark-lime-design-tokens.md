# Dark/Lime Design Tokens + Layout Shell (Epic 8 Story 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the dark/lime design system's foundation — CSS custom-property tokens, the Archivo font, and two reusable global utility classes (`.card`, `.tabularNums`) — that every subsequent Epic 8 story (route split, reskin, modal, chart, simulator) builds on.

**Architecture:** All tokens live as CSS custom properties on `:root` in `web/app/globals.css`, replacing the current light/dark starter theme with a single fixed dark theme (the design has no light mode or theme toggle). `web/app/layout.tsx` swaps the unused Geist font setup for Archivo via `next/font/google`, and `globals.css`'s `body` selector is wired to actually reference the resulting `--font-archivo` variable — the current code loads Geist but `globals.css` never references `var(--font-geist-sans)` anywhere, so today's app silently falls back to the plain Arial stack. This story fixes that wiring as part of switching fonts, not as separate scope creep.

**Tech Stack:** Next.js 16.3.4 (`next/font/google`), CSS Modules + a global stylesheet, Vitest + jsdom + `@testing-library/react` (already set up in `web/` from Epic 7 Story 3).

## Global Constraints

- Single fixed dark theme. No `prefers-color-scheme` branching, no light-mode tokens, no theme toggle — the design handoff has one theme only.
- Color tokens, exact hex values from the design handoff: background `#0a0c0a`, surface `#141813`, border `#2a2f28`, text primary `#eef2e8`, text secondary `#a9b3a3`, text tertiary `#9aa394`, accent `#c9f562`, accent-on (text/icons on accent fill) `#0a0c0a`, accent tint bg `#1d2a12`, accent tint border `#3d5a1c`, expense tint bg `#2b1a16`, expense tint icon `#f08b6d`, verdict yes `#c9f562`, verdict tight `#f0b34d`, verdict no `#f0715a`.
- Radius tokens: card/panel `16px`, input/button/control `12px`, pill/chip `999px`.
- Spacing tokens: card padding `20px` (design's 18-22px range, midpoint), row/grid gap `14px`.
- Only genuinely cross-component tokens are defined now (colors, radii, the two spacing values, one monospace stack). Per-heading font sizes (H1 38px, KPI 26px, H3 22-27px) are NOT tokenized here — they appear in enough different contexts with different exact values that hardcoding them per component (Story 3 onward) is simpler than guessing a shared scale now. Do not add more tokens than this plan specifies.
- No new npm dependencies — `next/font/google` ships with `next`, already used for Geist.
- `next/font/google` cannot run inside Vitest (jsdom doesn't execute Next's font-loading pipeline) — mock it in tests, following the same pattern already used for `@/auth` and `next/navigation` in `web/app/page.spec.tsx`.
- No changes to `page.tsx`'s own markup/logic, `login`/`signup` logic, or any data-fetching code in this story — this is CSS/font infrastructure only. Other pages inherit the new background/text-color/font automatically via the `body` selector; their component-level styling (hardcoded grays in `page.module.css`, etc.) is Story 3's job, not this one.

---

## Task 1: Design tokens, Archivo font, and shared utility classes

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Test: `web/app/layout.spec.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task of Story 1).
- Produces: CSS custom properties (`--color-background`, `--color-surface`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-accent`, `--color-accent-on`, `--color-accent-tint-bg`, `--color-accent-tint-border`, `--color-expense-tint-bg`, `--color-expense-tint-icon`, `--color-verdict-yes`, `--color-verdict-tight`, `--color-verdict-no`, `--radius-card`, `--radius-control`, `--radius-pill`, `--space-card-padding`, `--space-gap`, `--font-mono`) and two global classes (`.card`, `.tabularNums`) that every later Epic 8 story's CSS Modules reference via `composes: card from global;` / `composes: tabularNums from global;`.

- [ ] **Step 1: Write the failing test for the font wiring**

Create `web/app/layout.spec.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-archivo-mock" }),
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("applies the Archivo font variable to the html element and renders children", () => {
    render(
      <RootLayout>
        <p>child content</p>
      </RootLayout>
    );

    expect(document.documentElement.className).toContain("font-archivo-mock");
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- layout.spec` (from `web/`)
Expected: FAIL — `web/app/layout.tsx` still imports `Geist`/`Geist_Mono`, not `Archivo`, so `document.documentElement.className` won't contain `"font-archivo-mock"`.

- [ ] **Step 3: Rewrite `web/app/layout.tsx` to use Archivo**

```tsx
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Saldovio",
  description: "Personal finance decision assistant",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- layout.spec` (from `web/`)
Expected: PASS.

- [ ] **Step 5: Replace `web/app/globals.css` with the dark/lime token set**

```css
:root {
  --color-background: #0a0c0a;
  --color-surface: #141813;
  --color-border: #2a2f28;
  --color-text-primary: #eef2e8;
  --color-text-secondary: #a9b3a3;
  --color-text-tertiary: #9aa394;

  --color-accent: #c9f562;
  --color-accent-on: #0a0c0a;
  --color-accent-tint-bg: #1d2a12;
  --color-accent-tint-border: #3d5a1c;

  --color-expense-tint-bg: #2b1a16;
  --color-expense-tint-icon: #f08b6d;

  --color-verdict-yes: #c9f562;
  --color-verdict-tight: #f0b34d;
  --color-verdict-no: #f0715a;

  --radius-card: 16px;
  --radius-control: 12px;
  --radius-pill: 999px;

  --space-card-padding: 20px;
  --space-gap: 14px;

  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

html {
  height: 100%;
  color-scheme: dark;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
  background: var(--color-background);
  font-family: var(--font-archivo), Arial, Helvetica, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-card-padding);
}

.tabularNums {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm test` then `npx tsc --noEmit` (from `web/`)
Expected: all tests PASS (including the pre-existing `page.spec.tsx`, `proxy.spec.ts` suites — this task doesn't touch their code paths); no type errors.

- [ ] **Step 7: Manual verification in the browser**

Run `npm run dev` in `web/`. Visit `http://localhost:3001/login`: confirm the page background is near-black (`#0a0c0a`), text is light, and the font is visibly different from the browser's default sans-serif (Archivo, not Arial — check via devtools' computed `font-family` on `body`, should list `--font-archivo`'s generated font name first). Repeat for `/signup` and the dashboard (`/`, while logged in). Component-level styling (buttons, cards, tables) will still look plain/unstyled at this point — expected, that's Story 3.

- [ ] **Step 8: Commit**

```bash
git add web/app/globals.css web/app/layout.tsx web/app/layout.spec.tsx
git commit -m "feat: add dark/lime design tokens, Archivo font, and shared card/tabularNums utilities"
```

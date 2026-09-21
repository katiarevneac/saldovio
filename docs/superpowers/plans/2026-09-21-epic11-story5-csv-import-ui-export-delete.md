# Epic 11 Story 5: CSV Import UI + Export + Delete Account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Settings page's Data card — Export CSV (real file download), Import CSV (preview table with per-row checkboxes and duplicate/error flags, then commit), and Delete account (password-gated, cascade delete) — closing out Epic 11 (roadmap stage 7).

**Architecture:** `finance-api`'s `POST /transactions/import/preview`, `POST /transactions/import/commit`, and `GET /transactions/export` already exist and are tested (Epic 11 Story 4). This story is mostly UI/wiring for those three, plus one net-new backend endpoint (`DELETE /users/me`, password-verified cascade delete) that the approved spec calls for but no prior story built. Export is served through a new Next.js Route Handler (real HTTP download via `Content-Disposition`, not a client-side Blob) so a plain `<a href>` triggers it with zero client JS. Import is a client component (file input + account select + preview table + checkboxes) driving two Server Actions that proxy to Finance API, mirroring the existing `TransactionForm`/`createTransactionAction` pattern. Delete account is a plain `<form action={...}>` Server Action mirroring `updateSettingsAction`, ending in `signOut()`.

**Tech Stack:** Next.js 16 (App Router, Route Handlers, Server Actions), NestJS 12 + Prisma + nestjs-zod, Vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-09-15-settings-csv-import-design.md` (sections: "UI", "Finance API — new endpoints" — specifically the `DELETE /users/me` line, "Out of scope").

## Global Constraints

- Money: JSON wire amounts for the import-commit payload are plain numbers (`multipleOf(0.01)`), matching `ImportCommitDto`'s existing contract from Story 4 — do not convert to integer-bani or change this wire shape, it's already shipped and tested.
- Dates: raw `YYYY-MM-DD` strings only, never a JS `Date` object, at every layer touched by this story (consistent with every prior story's convention).
- Server-side ownership: `DELETE /users/me` and every import/export call go through `InternalAuthGuard` + `@CurrentUserId()`, exactly like every other authenticated route — never trust a client-supplied user id.
- Atomicity: the cascade delete (`recurring_rules` → `transactions` → `accounts` → `user`) must be one `$transaction` — a partial delete must never be possible.
- No secrets in logs; no fabricated values; negative-path tests are mandatory (wrong password → 401 no deletion; unauthenticated → 401).
- Before writing any Prisma `$transaction` code, consult context7 for current Prisma docs on batch (`$transaction([...])`) vs interactive (`$transaction(async (tx) => ...)`) semantics — this codebase has used interactive form for conditional multi-step writes (signup) but this deletion has no branching, so confirm the array form's atomicity guarantee applies before choosing it (per this project's CLAUDE.md: "Always use context7 to fetch current documentation before using any library").
- `web/AGENTS.md` warns this Next.js version may differ from training data — Route Handler and Server Action behavior (body size limits, streaming responses) must be checked against `web/node_modules/next/dist/docs/` before writing code that depends on them. This plan already did that (see Task 2/3 notes below); if anything looks off during implementation, re-check the docs rather than assuming.
- Server Actions have a **1MB default body size limit** (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Security" section) — Finance API's CSV upload cap is 5MB (`finance-api/src/main.ts`'s `useBodyParser('json', { limit: '5mb' })` and `transactions.controller.ts`'s `MAX_UPLOAD_BYTES`). Task 2 raises `serverActions.bodySizeLimit` to `'5mb'` in `next.config.ts` to match — without this, any CSV file over ~1MB would fail at the Next.js layer before ever reaching Finance API.
- Dedupe caveat: import dedupe is scoped per-account (Story 4's design). This story adds a one-line UI caveat in the import modal, not a functional fix.
- Out of scope (do not add): CSV formula-injection guarding on export; any account creation/editing from this flow; undoing a committed import.

---

### Task 1: Finance API — `DELETE /users/me`

**Files:**
- Create: `finance-api/src/users/dto/delete-account.dto.ts`
- Create: `finance-api/src/users/dto/delete-account.dto.spec.ts`
- Modify: `finance-api/src/users/users.service.ts`
- Modify: `finance-api/src/users/users.service.spec.ts`
- Modify: `finance-api/src/users/users.controller.ts`

**Interfaces:**
- Produces: `UsersService.deleteAccount(userId: number, password: string): Promise<void>` — throws `UnauthorizedException` on a wrong password, otherwise cascade-deletes the user and everything owned by them.
- Produces: `DELETE /users/me` route, guarded by `InternalAuthGuard`, body `{ password: string }`, `204` on success.

- [ ] **Step 1: Write the failing DTO test**

```typescript
// finance-api/src/users/dto/delete-account.dto.spec.ts
import { describe, expect, it } from 'vitest';
import { DeleteAccountSchema } from './delete-account.dto.js';

describe('DeleteAccountSchema', () => {
  it('accepts a non-empty password', () => {
    const result = DeleteAccountSchema.safeParse({ password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing password', () => {
    const result = DeleteAccountSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string password', () => {
    const result = DeleteAccountSchema.safeParse({ password: '' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd finance-api && npx vitest run src/users/dto/delete-account.dto.spec.ts`
Expected: FAIL — `Cannot find module './delete-account.dto.js'`

- [ ] **Step 3: Create the DTO**

```typescript
// finance-api/src/users/dto/delete-account.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DeleteAccountSchema = z.object({
  password: z.string().min(1),
});

export class DeleteAccountDto extends createZodDto(DeleteAccountSchema) {}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd finance-api && npx vitest run src/users/dto/delete-account.dto.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing service tests**

Append to `finance-api/src/users/users.service.spec.ts` (inside the existing `describe('UsersService', ...)` block, after the last `it(...)`):

```typescript
  it('cascade-deletes the user and everything they own on correct password', async () => {
    const user = await service.create({ email: testEmail, password: 'password123' });
    const [account] = await prisma.account.findMany({ where: { userId: user.id } });
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: new Prisma.Decimal(10),
        occurredOn: todayDateOnly(),
      },
    });
    await prisma.recurringRule.create({
      data: {
        accountId: account.id,
        type: 'expense',
        amount: new Prisma.Decimal(10),
        dayOfMonth: 1,
      },
    });

    await service.deleteAccount(user.id, 'password123');

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.account.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await prisma.transaction.findMany({ where: { accountId: account.id } })).toHaveLength(0);
    expect(await prisma.recurringRule.findMany({ where: { accountId: account.id } })).toHaveLength(0);
  });

  it('rejects a wrong password with UnauthorizedException and deletes nothing', async () => {
    const user = await service.create({ email: testEmail, password: 'password123' });

    await expect(service.deleteAccount(user.id, 'wrong-password')).rejects.toThrow('Invalid password');

    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    const accounts = await prisma.account.findMany({ where: { userId: user.id } });
    expect(accounts).toHaveLength(1);
  });
```

Also add `UnauthorizedException` to the existing `vitest`-unrelated NestJS import isn't needed in the spec file (the service throws it, the test only asserts on `.rejects.toThrow`), so no new import is required in the spec file itself.

- [ ] **Step 6: Run it to verify it fails**

Run: `cd finance-api && npx vitest run src/users/users.service.spec.ts`
Expected: FAIL — `service.deleteAccount is not a function`

- [ ] **Step 7: Implement `deleteAccount` on the service**

First, consult context7 for current Prisma docs on `$transaction` (batch array form vs. interactive callback form) to confirm the array form below is atomic for this case (no branching between the four deletes — a batch is not a data-dependency chain).

Modify `finance-api/src/users/users.service.ts`:

```typescript
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
```

(replace the existing `import { ConflictException, Injectable } from '@nestjs/common';` line with the one above)

Add this method to the `UsersService` class, after `updateSettings`:

```typescript
  async deleteAccount(userId: number, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid password');
    }

    // Prisma's schema has no onDelete: Cascade (FKs are RESTRICT by
    // default, per Epic 7 S1's baseline review) — every dependent row
    // must be deleted explicitly, in FK-safe order, inside one
    // transaction so a crash mid-delete can never leave orphaned data
    // or a half-deleted user (brief §12 atomicity).
    await this.prisma.$transaction([
      this.prisma.recurringRule.deleteMany({ where: { account: { userId } } }),
      this.prisma.transaction.deleteMany({ where: { account: { userId } } }),
      this.prisma.account.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd finance-api && npx vitest run src/users/users.service.spec.ts`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 9: Wire the controller route**

Modify `finance-api/src/users/users.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { InternalAuthGuard } from '../auth/internal-auth.guard.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(InternalAuthGuard)
  @Get('me/settings')
  getSettings(@CurrentUserId() userId: number) {
    return this.usersService.getSettings(userId);
  }

  @UseGuards(InternalAuthGuard)
  @Patch('me/settings')
  updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUserId() userId: number) {
    return this.usersService.updateSettings(userId, dto);
  }

  @UseGuards(InternalAuthGuard)
  @Delete('me')
  @HttpCode(204)
  deleteAccount(@Body() dto: DeleteAccountDto, @CurrentUserId() userId: number) {
    return this.usersService.deleteAccount(userId, dto.password);
  }
}
```

- [ ] **Step 10: Run the full finance-api test suite**

Run: `cd finance-api && npx vitest run`
Expected: PASS, no regressions

- [ ] **Step 11: Manual curl verification (negative paths not covered by unit tests)**

With `finance-api` running locally (`npm run start:dev`), and a real user's internal-auth-equivalent — since `DELETE /users/me` needs a signed internal JWT, this is easiest to verify once Task 5's UI exists; if verifying standalone now, mint a short-lived token the same way `web/lib/internal-auth.ts` does, or defer this manual check to the final whole-branch verification pass. Confirm: no `Authorization` header → 401; malformed token → 401. Note this in the task report rather than skipping silently if deferred.

- [ ] **Step 12: Commit**

```bash
git add finance-api/src/users
git commit -m "feat: add DELETE /users/me with password-verified cascade delete"
```

---

### Task 2: web — shared import types, Server Actions, and Server Action body-size config

**Files:**
- Create: `web/lib/import.ts`
- Create: `web/lib/import.spec.ts`
- Modify: `web/lib/schemas/settings.ts`
- Modify: `web/lib/schemas/settings.spec.ts`
- Modify: `web/app/actions.ts`
- Modify: `web/next.config.ts`

**Interfaces:**
- Consumes: `getAuthorizedHeaders(): Promise<HeadersInit>` from `@/lib/internal-auth`; `extractApiErrorMessage(response, fallback): Promise<string>` from `@/lib/api-errors`; `FINANCE_API_URL` from `@/lib/config`; `signOut` from `@/auth`.
- Produces (for Task 4 and Task 5 to consume):
  - `web/lib/import.ts`: `ImportRowStatus`, `ImportPreviewRow`, `ImportCommitRow` types, and `toCommitRow(row: ImportPreviewRow): ImportCommitRow`.
  - `web/app/actions.ts`: `previewImportAction(formData: FormData): Promise<{ rows: ImportPreviewRow[] }>`, `commitImportAction(input: { accountId: number; rows: ImportCommitRow[] }): Promise<{ imported: number; skipped_duplicates: number }>`, `deleteAccountAction(formData: FormData): Promise<void>`.
  - `web/lib/schemas/settings.ts`: `DeleteAccountSchema`.

- [ ] **Step 1: Write the failing test for the shared import types/helper**

```typescript
// web/lib/import.spec.ts
import { describe, expect, it } from "vitest";
import { toCommitRow, type ImportPreviewRow } from "./import";

describe("toCommitRow", () => {
  it("maps a valid preview row to a commit row, converting amount to a number", () => {
    const row: ImportPreviewRow = {
      hash: "abc123",
      status: "valid",
      description: "Grocery store",
      occurred_on: "2026-09-10",
      type: "expense",
      amount: "-45.30",
      category: "CARD_PAYMENT",
      reason: null,
    };

    expect(toCommitRow(row)).toEqual({
      hash: "abc123",
      occurredOn: "2026-09-10",
      type: "expense",
      amount: -45.3,
      category: "CARD_PAYMENT",
    });
  });

  it("falls back to an empty string category when category is null", () => {
    const row: ImportPreviewRow = {
      hash: "def456",
      status: "valid",
      description: "Salary",
      occurred_on: "2026-09-01",
      type: "income",
      amount: "3000",
      category: null,
      reason: null,
    };

    expect(toCommitRow(row).category).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run lib/import.spec.ts`
Expected: FAIL — `Cannot find module './import'`

- [ ] **Step 3: Create `web/lib/import.ts`**

```typescript
// web/lib/import.ts

// This is the one place `web` defines the shape of a CSV import
// preview/commit row. finance-api's own types (`ParsedRow` in
// revolut-parser.ts, `ImportRowInput` in transactions.service.ts) are
// the source of truth server-side and can't be imported directly
// across the service boundary (no shared package) — but within `web`,
// every place that renders a preview row or builds a commit payload
// goes through these types and `toCommitRow`, so the two can't drift
// from each other on this side of the wire.

export type ImportRowStatus = "valid" | "duplicate" | "error" | "skipped";

export type ImportPreviewRow = {
  hash: string;
  status: ImportRowStatus;
  description: string;
  occurred_on: string | null;
  type: "income" | "expense" | null;
  amount: string | null;
  category: string | null;
  reason: string | null;
};

export type ImportCommitRow = {
  hash: string;
  occurredOn: string;
  type: "income" | "expense";
  amount: number;
  category: string;
};

// Only ever called on a row whose status is "valid" (the UI disables
// the checkbox for every other status) — finance-api's parser
// guarantees occurred_on/type/amount are non-null exactly when status
// is "valid" (see revolut-parser.ts's parseRecord).
export function toCommitRow(row: ImportPreviewRow): ImportCommitRow {
  return {
    hash: row.hash,
    occurredOn: row.occurred_on as string,
    type: row.type as "income" | "expense",
    amount: Number(row.amount),
    category: row.category ?? "",
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run lib/import.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for `DeleteAccountSchema`**

Read `web/lib/schemas/settings.spec.ts` first to match its existing style, then append a new `describe` block to it:

```typescript
describe("DeleteAccountSchema", () => {
  it("accepts a non-empty password", () => {
    const result = DeleteAccountSchema.safeParse({ password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password with a clear message", () => {
    const result = DeleteAccountSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });
});
```

Add `DeleteAccountSchema` to the existing import line at the top of the spec file (e.g. `import { UpdateSettingsSchema, DeleteAccountSchema } from "./settings";`).

- [ ] **Step 6: Run it to verify it fails**

Run: `cd web && npx vitest run lib/schemas/settings.spec.ts`
Expected: FAIL — `DeleteAccountSchema` is not exported

- [ ] **Step 7: Add `DeleteAccountSchema`**

Append to `web/lib/schemas/settings.ts`:

```typescript
export const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd web && npx vitest run lib/schemas/settings.spec.ts`
Expected: PASS

- [ ] **Step 9: Add the three new Server Actions**

Modify `web/app/actions.ts` — update the top imports and append the new functions:

```typescript
"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";
import { extractApiErrorMessage } from "@/lib/api-errors";
import { CreateAccountSchema } from "@/lib/schemas/accounts";
import { CreateRecurringRuleSchema } from "@/lib/schemas/recurring-rules";
import { UpdateSettingsSchema, DeleteAccountSchema } from "@/lib/schemas/settings";
import type { ImportPreviewRow, ImportCommitRow } from "@/lib/import";
```

(this replaces the existing import block; every existing import line is kept, `signOut` and `DeleteAccountSchema`/the `import` type import are the only additions)

Append these functions at the end of the file, after `updateSettingsAction`:

```typescript
export async function previewImportAction(
  formData: FormData
): Promise<{ rows: ImportPreviewRow[] }> {
  const headers = await getAuthorizedHeaders();

  // formData carries a File under "file" plus "accountId" — do NOT set
  // a Content-Type header here, fetch generates the multipart boundary
  // itself from the FormData body.
  const response = await fetch(`${FINANCE_API_URL}/transactions/import/preview`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not preview import");
    throw new Error(message);
  }

  return response.json();
}

export async function commitImportAction(input: {
  accountId: number;
  rows: ImportCommitRow[];
}): Promise<{ imported: number; skipped_duplicates: number }> {
  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/transactions/import/commit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not commit import");
    throw new Error(message);
  }

  return response.json();
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const parsed = DeleteAccountSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    redirect(`/settings?deleteError=${encodeURIComponent(message)}`);
  }

  const headers = await getAuthorizedHeaders();

  const response = await fetch(`${FINANCE_API_URL}/users/me`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    const message = await extractApiErrorMessage(response, "Could not delete account");
    redirect(`/settings?deleteError=${encodeURIComponent(message)}`);
  }

  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 10: Raise the Server Action body size limit**

Modify `web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches finance-api's own CSV upload cap exactly (main.ts's
      // useBodyParser('json', { limit: '5mb' }) and
      // transactions.controller.ts's MAX_UPLOAD_BYTES) — Server
      // Actions default to a 1MB body limit, which previewImportAction
      // would hit on any real statement file well before Finance API's
      // own limit ever applied.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
```

Before finalizing, check `web/node_modules/next/dist/docs/` (or context7) for the exact current config key path (`experimental.serverActions.bodySizeLimit` vs. a possibly-stabilized non-experimental location) — this plan was written against `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`'s "Configuration" section, which as read showed it still under `experimental.serverActions`; confirm this hasn't moved before committing.

- [ ] **Step 11: Run the full web test suite**

Run: `cd web && npx vitest run`
Expected: PASS, no regressions (no existing test imports `web/app/actions.ts`'s new exports yet, so nothing else should be affected)

- [ ] **Step 12: Type-check and lint**

Run: `cd web && npx tsc --noEmit && npx eslint`
Expected: clean

- [ ] **Step 13: Commit**

```bash
git add web/lib/import.ts web/lib/import.spec.ts web/lib/schemas/settings.ts web/lib/schemas/settings.spec.ts web/app/actions.ts web/next.config.ts
git commit -m "feat: add import/export/delete-account Server Actions and shared import types"
```

---

### Task 3: web — Export Route Handler

**Files:**
- Create: `web/app/api/export/route.ts`
- Create: `web/app/api/export/route.spec.ts`

**Interfaces:**
- Consumes: `getAuthorizedHeaders()` from `@/lib/internal-auth`; `FINANCE_API_URL` from `@/lib/config`.
- Produces: `GET /api/export` — streams the CSV from Finance API's `GET /transactions/export` back to the browser with `Content-Disposition: attachment`, so a plain `<a href="/api/export">` triggers a real file download.

- [ ] **Step 1: Write the failing test**

```typescript
// web/app/api/export/route.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedHeadersMock } = vi.hoisted(() => ({
  getAuthorizedHeadersMock: vi.fn(),
}));
vi.mock("@/lib/internal-auth", () => ({
  getAuthorizedHeaders: getAuthorizedHeadersMock,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

beforeEach(() => {
  getAuthorizedHeadersMock.mockReset();
  fetchMock.mockReset();
});

describe("GET /api/export", () => {
  it("streams the CSV with a download Content-Disposition header", async () => {
    getAuthorizedHeadersMock.mockResolvedValue({ Authorization: "Bearer x" });
    fetchMock.mockResolvedValue(
      new Response("date,account,type,amount,category\n2026-09-10,Cont curent,expense,-45.30,Groceries", {
        status: 200,
      })
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="saldovio-transactions.csv"'
    );
    const body = await response.text();
    expect(body).toContain("date,account,type,amount,category");
  });

  it("returns 401 when the caller is not authenticated", async () => {
    getAuthorizedHeadersMock.mockRejectedValue(new Error("Not authenticated"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes through a Finance API error status", async () => {
    getAuthorizedHeadersMock.mockResolvedValue({ Authorization: "Bearer x" });
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run app/api/export/route.spec.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Create the Route Handler**

```typescript
// web/app/api/export/route.ts
import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";

export async function GET() {
  let headers: HeadersInit;
  try {
    headers = await getAuthorizedHeaders();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const response = await fetch(`${FINANCE_API_URL}/transactions/export`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    return new Response("Could not export transactions", { status: response.status });
  }

  const csv = await response.text();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="saldovio-transactions.csv"',
    },
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run app/api/export/route.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full web test suite, type-check, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all clean, no regressions

- [ ] **Step 6: Commit**

```bash
git add web/app/api/export
git commit -m "feat: add /api/export Route Handler for CSV download"
```

---

### Task 4: web — Import CSV modal (form + preview table)

**Files:**
- Create: `web/components/ImportCsvModal.tsx`
- Create: `web/components/ImportCsvModal.spec.tsx`
- Create: `web/components/ImportCsvForm.tsx`
- Create: `web/components/ImportCsvForm.module.css`
- Create: `web/components/ImportCsvForm.spec.tsx`

**Interfaces:**
- Consumes: `Modal` from `@/components/Modal` (props: `open`, `onClose`, `title`, `children`); `Account` type from `@/lib/accounts`; `previewImportAction`, `commitImportAction` from `@/app/actions`; `ImportPreviewRow`, `toCommitRow` from `@/lib/import`.
- Produces: `ImportCsvModal({ accounts: Account[] })` default export — the trigger button + modal, for Task 5's Data card to render directly (same shape as `AddTransactionModal`).

- [ ] **Step 1: Write the failing test for the trigger/modal shell**

```typescript
// web/components/ImportCsvModal.spec.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/app/actions", () => ({
  previewImportAction: vi.fn(),
  commitImportAction: vi.fn(),
}));

import ImportCsvModal from "./ImportCsvModal";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-01-01",
    balance: "100.00",
  },
];

describe("ImportCsvModal", () => {
  it("opens the modal with the import form when the trigger is clicked", () => {
    render(<ImportCsvModal accounts={accounts} />);

    expect(
      screen.queryByRole("heading", { name: "Import transactions from CSV" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    expect(
      screen.getByRole("heading", { name: "Import transactions from CSV" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
  });

  it("closes the modal when the close button is clicked", () => {
    render(<ImportCsvModal accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("heading", { name: "Import transactions from CSV" })
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run components/ImportCsvModal.spec.tsx`
Expected: FAIL — cannot find `./ImportCsvModal` (and transitively `./ImportCsvForm`)

- [ ] **Step 3: Write the failing test for the form's preview/commit behavior**

```typescript
// web/components/ImportCsvForm.spec.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { previewImportActionMock, commitImportActionMock } = vi.hoisted(() => ({
  previewImportActionMock: vi.fn(),
  commitImportActionMock: vi.fn(),
}));
vi.mock("@/app/actions", () => ({
  previewImportAction: previewImportActionMock,
  commitImportAction: commitImportActionMock,
}));

import ImportCsvForm from "./ImportCsvForm";

const accounts = [
  {
    id: 1,
    name: "Cont curent",
    current_balance: "0.00",
    reference_date: "2026-01-01",
    balance: "100.00",
  },
];

const previewRows = [
  {
    hash: "h1",
    status: "valid" as const,
    description: "Grocery store",
    occurred_on: "2026-09-10",
    type: "expense" as const,
    amount: "-45.30",
    category: "CARD_PAYMENT",
    reason: null,
  },
  {
    hash: "h2",
    status: "duplicate" as const,
    description: "Rent",
    occurred_on: "2026-09-01",
    type: "expense" as const,
    amount: "-1200",
    category: "TRANSFER",
    reason: "Already imported",
  },
];

function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  previewImportActionMock.mockReset();
  commitImportActionMock.mockReset();
});

describe("ImportCsvForm", () => {
  it("previews a chosen file and renders rows with checkboxes reflecting status", async () => {
    previewImportActionMock.mockResolvedValue({ rows: previewRows });
    const onClose = vi.fn();

    render(<ImportCsvForm accounts={accounts} onClose={onClose} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Grocery store")).toBeInTheDocument();
    });

    expect(previewImportActionMock).toHaveBeenCalledTimes(1);
    const formDataArg = previewImportActionMock.mock.calls[0][0] as FormData;
    expect(formDataArg.get("accountId")).toBe("1");
    expect(formDataArg.get("file")).toBe(file);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked(); // valid row
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked(); // duplicate row
    expect(checkboxes[1]).toBeDisabled();
    expect(screen.getByText("Already imported")).toBeInTheDocument();
  });

  it("commits only the checked rows and reports the result", async () => {
    previewImportActionMock.mockResolvedValue({ rows: previewRows });
    commitImportActionMock.mockResolvedValue({ imported: 1, skipped_duplicates: 0 });
    const onClose = vi.fn();

    render(<ImportCsvForm accounts={accounts} onClose={onClose} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => screen.getByText("Grocery store"));

    fireEvent.click(screen.getByRole("button", { name: "Commit selected" }));

    await waitFor(() => {
      expect(screen.getByText("Imported 1 transaction.")).toBeInTheDocument();
    });

    expect(commitImportActionMock).toHaveBeenCalledWith({
      accountId: 1,
      rows: [
        {
          hash: "h1",
          occurredOn: "2026-09-10",
          type: "expense",
          amount: -45.3,
          category: "CARD_PAYMENT",
        },
      ],
    });
  });

  it("shows an error message when preview fails", async () => {
    previewImportActionMock.mockRejectedValue(new Error("Could not parse CSV file"));

    render(<ImportCsvForm accounts={accounts} onClose={vi.fn()} />);

    const file = new File(["irrelevant"], "statement.csv", { type: "text/csv" });
    selectFile(screen.getByLabelText("CSV file"), file);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Could not parse CSV file")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd web && npx vitest run components/ImportCsvForm.spec.tsx`
Expected: FAIL — cannot find `./ImportCsvForm`

- [ ] **Step 5: Create `ImportCsvForm.module.css`**

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field label {
  font-size: 0.875rem;
}

.field select,
.field input[type="file"] {
  padding: 0.4rem 0.5rem;
  font-size: 1rem;
}

.caveat {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.error {
  color: var(--color-verdict-no);
  font-size: 0.875rem;
}

.success {
  color: var(--color-accent);
  font-size: 0.875rem;
}

.previewButton,
.commitButton {
  align-self: flex-start;
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-on);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

.previewButton:disabled,
.commitButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  text-align: left;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
}

.statusPill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
}

.statusValid {
  composes: statusPill;
  background: var(--color-accent-tint-bg);
  border: 1px solid var(--color-accent-tint-border);
  color: var(--color-accent);
}

.statusOther {
  composes: statusPill;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
}

.tableWrap {
  max-height: 320px;
  overflow-y: auto;
}
```

- [ ] **Step 6: Create `ImportCsvForm.tsx`**

```typescript
// web/components/ImportCsvForm.tsx
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
```

- [ ] **Step 7: Run the ImportCsvForm test to verify it passes**

Run: `cd web && npx vitest run components/ImportCsvForm.spec.tsx`
Expected: PASS (3 tests)

- [ ] **Step 8: Create `ImportCsvModal.tsx`**

```typescript
// web/components/ImportCsvModal.tsx
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
```

- [ ] **Step 9: Create `ImportCsvModal.module.css`**

```css
.trigger {
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-on);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 10: Run the ImportCsvModal test to verify it passes**

Run: `cd web && npx vitest run components/ImportCsvModal.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 11: Run the full web test suite, type-check, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all clean, no regressions

- [ ] **Step 12: Commit**

```bash
git add web/components/ImportCsvModal.tsx web/components/ImportCsvModal.spec.tsx web/components/ImportCsvModal.module.css web/components/ImportCsvForm.tsx web/components/ImportCsvForm.module.css web/components/ImportCsvForm.spec.tsx
git commit -m "feat: add CSV import modal with preview table and per-row checkboxes"
```

---

### Task 5: web — Settings page Data card (wire Export link, Import modal, Delete account form)

**Files:**
- Modify: `web/app/(dashboard)/settings/page.tsx`
- Modify: `web/app/(dashboard)/settings/page.module.css`
- Modify: `web/app/(dashboard)/settings/page.spec.tsx`

**Interfaces:**
- Consumes: `getMyAccounts()` from `@/lib/accounts`; `deleteAccountAction` from `@/app/actions`; `ImportCsvModal` from `@/components/ImportCsvModal`.

- [ ] **Step 1: Write the failing tests for the new Data card**

Read the full current `web/app/(dashboard)/settings/page.spec.tsx` first (already read during planning — reproduced context: it mocks `@/auth`, `next/navigation`, `@/lib/settings`, and `@/app/actions`). Add a mock for `@/lib/accounts` and `@/components/ImportCsvModal`, and 4 new `it(...)` blocks. Modify the file's mock section and append tests:

Add near the top, alongside the other `vi.mock` calls:

```typescript
const { getMyAccountsMock } = vi.hoisted(() => ({ getMyAccountsMock: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ getMyAccounts: getMyAccountsMock }));

vi.mock("@/components/ImportCsvModal", () => ({
  default: () => <div data-testid="import-csv-modal-stub" />,
}));
```

Update the existing `vi.mock("@/app/actions", ...)` call to also export `deleteAccountAction`:

```typescript
vi.mock("@/app/actions", () => ({
  updateSettingsAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));
```

Update `beforeEach` to reset/seed the new mock:

```typescript
beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
  getMySettingsMock.mockReset();
  getMyAccountsMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
  getMySettingsMock.mockResolvedValue({
    essential_spend: null,
    payday: null,
    horizon_days: 30,
  });
  getMyAccountsMock.mockResolvedValue([
    {
      id: 1,
      name: "Cont curent",
      current_balance: "0.00",
      reference_date: "2026-01-01",
      balance: "100.00",
    },
  ]);
});
```

Append these tests inside the existing `describe("SettingsPage", ...)` block:

```typescript
  it("renders the Data card with an export link and the import modal", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const exportLink = screen.getByRole("link", { name: "Export CSV" });
    expect(exportLink).toHaveAttribute("href", "/api/export");
    expect(screen.getByTestId("import-csv-modal-stub")).toBeInTheDocument();
  });

  it("renders the delete-account form with a password field", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete account permanently" })
    ).toBeInTheDocument();
  });

  it("shows the delete-account error message from searchParams.deleteError", async () => {
    const ui = await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ deleteError: "Invalid password" }),
    });
    render(ui);

    expect(screen.getByText("Invalid password")).toBeInTheDocument();
  });

  it("fetches accounts alongside settings", async () => {
    await SettingsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });

    expect(getMyAccountsMock).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run "app/(dashboard)/settings/page.spec.tsx"`
Expected: FAIL — `getMyAccountsMock` never called / Data card elements not found

- [ ] **Step 3: Update `page.tsx`**

Replace the full contents of `web/app/(dashboard)/settings/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMySettings } from "@/lib/settings";
import { getMyAccounts } from "@/lib/accounts";
import { updateSettingsAction, deleteAccountAction } from "@/app/actions";
import ImportCsvModal from "@/components/ImportCsvModal";
import styles from "./page.module.css";

export default async function SettingsPage(props: PageProps<"/settings">) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [settings, accounts, searchParams] = await Promise.all([
    getMySettings(),
    getMyAccounts(),
    props.searchParams,
  ]);

  const errorMessage =
    typeof searchParams.error === "string" ? searchParams.error : null;
  const saved = searchParams.saved === "1";
  const deleteErrorMessage =
    typeof searchParams.deleteError === "string" ? searchParams.deleteError : null;

  return (
    <div className={styles.page}>
      <h1>Settings</h1>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Profile</h2>
        <p className={styles.profileRow}>
          <span className={styles.profileLabel}>Email</span>
          <span>{session.user.email}</span>
        </p>
        <p className={styles.note}>Saldovio supports RON only for now.</p>
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Forecast assumptions</h2>

        {saved && <p className={styles.success}>Settings saved.</p>}
        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <form className={styles.form} action={updateSettingsAction}>
          <div className={styles.field}>
            <label htmlFor="essentialSpend">Essential spend (RON, optional)</label>
            <input
              id="essentialSpend"
              name="essentialSpend"
              type="number"
              min={0}
              step="0.01"
              defaultValue={settings.essential_spend ?? ""}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="payday">Payday (day of month, optional)</label>
            <input
              id="payday"
              name="payday"
              type="number"
              min={1}
              max={31}
              defaultValue={settings.payday ?? ""}
            />
            <p className={styles.hint}>
              When set, the forecast and simulator windows run to your next
              payday instead of a fixed number of days.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor="horizonDays">Forecast horizon (days)</label>
            <input
              id="horizonDays"
              name="horizonDays"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.horizon_days}
              required
            />
            <p className={styles.hint}>Used only when no payday is set.</p>
          </div>

          <button type="submit">Save settings</button>
        </form>
      </section>

      <section className={styles.sectionCard}>
        <h2 className={styles.cardTitle}>Data</h2>

        <div className={styles.dataActions}>
          <a href="/api/export" className={styles.exportButton}>
            Export CSV
          </a>
          <ImportCsvModal accounts={accounts} />
        </div>

        <div className={styles.deleteSection}>
          <h3 className={styles.deleteTitle}>Delete account</h3>
          <p className={styles.deleteWarning}>
            This permanently deletes your account and all its data. This
            cannot be undone.
          </p>

          {deleteErrorMessage && <p className={styles.error}>{deleteErrorMessage}</p>}

          <form className={styles.deleteForm} action={deleteAccountAction}>
            <div className={styles.field}>
              <label htmlFor="password">Current password</label>
              <input id="password" name="password" type="password" required />
            </div>
            <button type="submit" className={styles.deleteButton}>
              Delete account permanently
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the new CSS classes**

Append to `web/app/(dashboard)/settings/page.module.css`:

```css
.dataActions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.exportButton {
  display: inline-flex;
  align-items: center;
  padding: 11px 20px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-on);
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
}

.deleteSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.deleteTitle {
  font-size: 15px;
  margin: 0;
  color: var(--color-verdict-no);
}

.deleteWarning {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.deleteForm {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.deleteButton {
  align-self: flex-start;
  padding: 11px 20px;
  border: 1px solid var(--color-verdict-no);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-verdict-no);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd web && npx vitest run "app/(dashboard)/settings/page.spec.tsx"`
Expected: PASS (all tests, including the 5 pre-existing ones and the 4 new ones)

- [ ] **Step 6: Run the full web test suite, type-check, lint, build**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint && npx next build`
Expected: all clean, no regressions. The `next build` step is the real proof the new Route Handler, Server Actions, and `next.config.ts` change are all valid together — Vitest alone doesn't exercise the build pipeline.

- [ ] **Step 7: Commit**

```bash
git add "web/app/(dashboard)/settings/page.tsx" "web/app/(dashboard)/settings/page.module.css" "web/app/(dashboard)/settings/page.spec.tsx"
git commit -m "feat: wire Data card (export link, CSV import modal, delete account) into Settings page"
```

---

## Final Verification (after all 5 tasks, before requesting the whole-branch review)

- [ ] Run `cd finance-api && npx vitest run && npx tsc --noEmit && npx oxlint src/ test/`
- [ ] Run `cd web && npx vitest run && npx tsc --noEmit && npx eslint && npx next build`
- [ ] Manual browser pass (finance-api on :3000, web on :3001, both already running in this session): sign in, go to `/settings`, click "Export CSV" and confirm a `saldovio-transactions.csv` file downloads with real rows; open "Import CSV", pick a small test CSV in Revolut's format (or construct one inline with a text editor — header row `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`, at least one `COMPLETED` row), preview it, confirm the checkbox/status rendering, commit, confirm the transaction shows up on `/transactions`; re-import the same file and confirm the row now shows as a duplicate with its checkbox disabled; test "Delete account" with a wrong password (expect the inline error, no sign-out) and then, only on a throwaway test account, with the correct password (expect sign-out + redirect to `/login`).

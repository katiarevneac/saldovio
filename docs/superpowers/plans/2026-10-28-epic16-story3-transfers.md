# Epic 16 Story 3 — atomic internal transfers

Spec: `docs/superpowers/specs/2026-10-01-epic16-transactions-transfers-import-design.md` §4 (binding), refined by the approved in-chat design below. Worktree `.worktrees/epic16-story3`, branch `epic16-story3-transfers`, STACKED on `epic16-story2-edit-void-restore` (PR #24, unmerged). Story 2 gave: `serialize()`, `findOwned`, `resolveEditedAmounts`, `calendarDateString` (exported from `finance-api/src/transactions/dto/update-transaction.dto.ts`), `updateWithSibling`, void/restore/PATCH that already operate on `transferId` pairs.

Baselines: finance-api `npm test` = 233 pass / 6 known-red (F04, F05, F10 x2, F16 x2). web `npm test` baseline: record at start of Task 2 (documented: 2 known-red F08 tests may exist; they must remain the only failures).

## Approved design decisions (user-approved 2026-10-28)

- `POST /transactions/transfer` body `{ sourceAccountId, destinationAccountId, amount, occurredOn, category? }`; `amount` positive magnitude, max 2 decimals, non-zero; endpoint derives signs (source `-m`, destination `+m`).
- same account both sides -> 400. Either account not owned by caller -> 403 `'Account does not belong to the current user'` (same as create), checked BEFORE any write.
- **Archived** source or destination -> 400 (message names the account).
- **Backdated legs rejected:** if `isBackdated(occurredOn, account.referenceDate, account.openingBoundary)` is true for EITHER account -> 400 naming that account and its reference date; reason: a leg inside an opening snapshot would not move its balance, silently changing the consolidated total (CLAUDE.md financial rule 1). No transfer is written.
- Future date -> 400 (transfers are always `actual`; reuse create()'s future-date message style). No planned transfers.
- One `prisma.$transaction`: two rows `type: 'transfer'`, `lifecycle: 'actual'`, shared fresh `transferId` (uuid, `crypto.randomUUID()`), same `occurredOn` and `category`. Response: `{ transfer_id, source: serialize(leg), destination: serialize(leg) }`.
- Idempotency keys are out of scope (Epic 21).
- Money via `Prisma.Decimal`, dates `YYYY-MM-DD` strings (no Date arithmetic beyond the established `.getTime()` vs `clock.today()` pattern), snake_case responses, Zod DTO with `.max()` bounds, `@Throttle({ default: { limit: 30, ttl: seconds(60) } })`, `InternalAuthGuard` (class-level).

## Global constraints

- Real-DB tests, no mocks (style of `finance-api/src/transactions/transactions.service.spec.ts`). Forced-failure atomicity test uses a real Postgres trigger (see the void rollback tests: `DROP TRIGGER IF EXISTS`/`DROP FUNCTION IF EXISTS` before create and in `finally`).
- Docs-first: verify unfamiliar NestJS/Zod/Prisma/Next.js APIs via context7.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- web: money never `parseFloat`ed from API decimal strings; user-typed amount follows the existing TransactionForm pattern (`Number(amount)` on user input only, as it does today).

## Task 1 — Finance API `POST /transactions/transfer`

Files: new `finance-api/src/transactions/dto/create-transfer.dto.ts` (+ spec), edit `transactions.service.ts` (new `createTransfer(dto, userId)`), `transactions.controller.ts` (route; place it before any `:id` routes), `transactions.service.spec.ts`.
- DTO: `sourceAccountId` int, `destinationAccountId` int, `amount` number, `occurredOn` via `calendarDateString`, `category` string max 200 optional. DTO spec: valid accepted; calendar-invalid date rejected; missing fields rejected.
- Service validation order: same-account 400 -> ownership 403 (load both accounts in one query scoped `userId`; if count != 2 -> 403) -> archived 400 -> amount rules (reuse `resolveEditedAmounts`' decimal/zero logic or extract the shared piece; do not fork divergent logic) -> future date 400 -> backdated 400 -> write.
- Tests (all real DB): happy path (two legs, signs, shared transfer_id, same date/category, response shape); consolidated total unchanged (sum of both accounts' `AccountsService.findMine` balances equal before/after); balances actually move (source down, destination up); same account 400; foreign source 403, foreign destination 403 (and nothing written); archived 400 either side; backdated 400 for source-side and for destination-side (message names account + reference date; nothing written); future date 400; zero/3-decimal/negative amount 400; forced mid-transfer failure (trigger raising on the second leg insert) leaves zero rows for both accounts and unchanged balances; a freshly created transfer can be voided, restored and edited through Story 2's service methods as a pair (one integration test).
- Run: covering specs, full suite (only the 6 baseline reds), `npx tsc -p tsconfig.build.json --noEmit`, `npm run lint`.

## Task 2 — web: schema + Server Action

Files: `web/lib/schemas/transactions.ts` (+ spec), `web/app/actions.ts` (+ spec if the file already has one; otherwise a focused test of the new action in the style of existing action tests), and any shared type.
- `CreateTransferSchema`: `sourceAccountId` and `destinationAccountId` numbers, differing (`.refine`, message "Choose two different accounts"), `amount` positive number (`> 0`), `occurredOn` same rule as `CreateTransactionSchema`, `category` optional. Keep `CreateTransactionSchema` unchanged (expense/income only).
- `createTransferAction(input)` Server Action: posts to `${FINANCE_API_URL}/transactions/transfer` with `getAuthorizedHeaders()`, same error path as `createTransactionAction` (`extractApiErrorMessage`). Returns void.
- Tests: schema accepts valid, rejects same accounts / non-positive amount / bad date; action posts the right URL/body and surfaces API error messages (follow the mocking style existing action tests use).

## Task 3 — web: Transfer option in the add-transaction form

File: `web/components/TransactionForm.tsx` (+ its spec; create `TransactionForm.spec.tsx` if absent, or extend the existing one), `TransactionForm.module.css` only if needed (tokens only, no hardcoded colors).
- Type select gains `transfer`. When selected: the single Account select is replaced by **From** and **To** selects (both from the non-archived `accounts` prop as the current form does; defaults: first and second account when available). Amount stays positive-entered; no sign flip for transfer. Category still shown.
- Per-account backdated notice: for each of From/To, if `isBackdated(occurredOn, account.reference_date, account.opening_boundary)`, show a notice naming the account and reference date saying a transfer can't be dated on/before an account's opening balance; submit button disabled while either applies.
- Submit: `CreateTransferSchema.safeParse(...)`; errors shown through the same error element; success calls `createTransferAction`, then `router.refresh()` and `onSuccess?.()` exactly like the existing path. Existing expense/income behavior must be byte-identical (existing tests unchanged and green).
- If fewer than 2 accounts exist: Transfer option disabled (or shows "Create a second account to transfer between accounts") — keep it simple and tested.
- Tests: selecting Transfer shows From/To and hides the single Account select; same account chosen shows the schema error; backdated on either side disables submit and names the account; valid submit calls `createTransferAction` with `{sourceAccountId, destinationAccountId, amount, occurredOn, category}` and not `createTransactionAction`; expense path still calls `createTransactionAction` with the signed amount.
- Run: covering specs, full web suite (only baseline reds), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Wrap-up

Final whole-branch review focuses on: ownership/atomicity of the new endpoint, consolidated-total invariant, drift between web backdated check and the API's, any consumer misreading transfer legs (Overview already excludes `transfer`; check Transactions page display of legs). Add a progress-log entry to CLAUDE.md. Open the PR with base `epic16-story2-edit-void-restore` (stacked) and note that it must be retargeted to `main` after #24 merges.

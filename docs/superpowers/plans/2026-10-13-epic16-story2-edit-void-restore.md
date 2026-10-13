# Epic 16 Story 2 — edit / void / restore / impact-preview

Spec: `docs/superpowers/specs/2026-10-01-epic16-transactions-transfers-import-design.md` §5 (binding). finance-api only; no web changes. Worktree: `.worktrees/epic16-story2`, branch `epic16-story2-edit-void-restore`.

Baseline: `npm test` in `finance-api` = 182 pass / 6 fail (documented F0x reproduction tests: F04, F05, F10 x2, F16 x2). Do not touch them; no new failures allowed.

## Global constraints

- Money: `Prisma.Decimal` / `toDecimalString`, never float math. Dates: `YYYY-MM-DD` strings via `fromDateOnlyString`/`toDateOnlyString`, no `Date` arithmetic (financial-rules.md §3); comparing against `this.clock.today()` uses `.getTime()` exactly like `create()`.
- Every endpoint: `InternalAuthGuard` (class-level already), owner-scoped lookup `account: { userId }`. A row that does not exist OR belongs to someone else both throw the same `NotFoundException('Transaction not found')` (no existence leak).
- Validation via Zod DTOs (`createZodDto`), same style as `create-transaction.dto.ts`; bound every string with `.max()`.
- Response shape: snake_case, amounts as decimal strings, same fields as `create()`'s response plus `version`, `description`, `transfer_id`. Introduce ONE private `serialize(t)` in the service and use it in create/findAll/new endpoints (create/findAll gain the three extra fields; update the existing tests that deep-equal shapes, if any).
- Existing tests style: real DB, no mocks (`transactions.service.spec.ts`). Mutating routes get `@Throttle({ default: { limit: 30, ttl: seconds(60) } })`.
- Commit per task; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Task 1 — `findAll` hides voided; `serialize`; `includeVoided`

- `GET /transactions?includeVoided=true` (query parsed by a tiny Zod DTO `ListTransactionsQueryDto`, `includeVoided: z.enum(['true','false']).optional()`). Default: `lifecycle: { not: 'voided' }` in the where. `findAll(userId, includeVoided = false)`.
- Add `serialize()` (see constraints). Tests: voided row hidden by default, shown with flag, other user's voided row never shown, response now includes `version: 0`, `description: null`, `transfer_id: null`.

## Task 2 — void / restore

- `POST /transactions/:id/void`, `POST /transactions/:id/restore`. Body for both: `{ version: number }` (`UpdateVersionDto`, `version` int >= 0).
- Load row owner-scoped (404 otherwise). Void: only from `actual` or `planned` (already `voided` -> 400 "already voided"; `adjustment` -> 400). Restore: only `voided` -> `actual` (anything else 400). Restore re-applies the future-date rule: if `occurredOn` > today, 400 (an actual cannot be future-dated).
- Concurrency: `updateMany({ where: { id, version: dto.version }, data: { lifecycle, version: { increment: 1 } } })`; `count === 0` -> `ConflictException('Transaction was modified; re-fetch and retry')`.
- Transfer rows (`transferId != null`): do the same for BOTH legs inside one `prisma.$transaction`; the addressed leg is version-checked, the sibling is updated by `transferId` (its version also incremented). Return the addressed leg serialized.
- Tests: void then balance via `AccountsService`-free assertion is NOT needed here (Task 4 covers balance); assert lifecycle/version values, stale version -> 409, other user -> 404, restore of `planned` -> 400, void of voided -> 400, transfer pair voids both legs, **forced mid-`$transaction` failure** (mock-free: make the sibling update fail by e.g. deleting the sibling leg row before the call inside a spy, or pass an impossible state; implementer chooses a real-DB approach, same proof standard as the signup-rollback test: assert first leg unchanged after rejection).

## Task 3 — edit (PATCH)

- `PATCH /transactions/:id`, body `UpdateTransactionDto`: `{ version (required), amount?: number, occurredOn?: YYYY-MM-DD, category?: string<=200, description?: string<=500 }`; reject an empty change set (at least one of the four) with 400; amount: at most 2 decimals (reject with 400) .
- Row must not be `voided` (400 "restore it first") or `adjustment`.
- Amount semantics: for `income`/`expense` rows the caller sends the SIGNED amount like `create` does; reject sign mismatch (`income` must be > 0, `expense` < 0) with 400. For transfer rows (`transferId` set) the caller sends a POSITIVE magnitude; the leg whose stored amount is negative becomes `-m`, the other `+m`; both legs also get the same `occurredOn`/`category`/`description` change. Whole pair in one `$transaction`; addressed leg version-checked as in Task 2.
- Future-date rule: if resulting lifecycle is `actual` and new `occurredOn` > today -> 400 (same message as create).
- Tests: each field edits; stale version 409; voided 400; sign mismatch 400; 3-decimal 400; future date 400; other user 404; transfer pair edited as a unit with opposite signs; **forced mid-transaction failure rolls back leg A** (same proof standard as Task 2); version increments on both legs.

## Task 4 — impact-preview

- Export `AccountsService` from `AccountsModule`; import `AccountsModule` in `TransactionsModule`.
- `GET /transactions/:id/impact-preview?action=edit|void|restore&amount=&occurredOn=` (Zod query DTO; `amount`/`occurredOn` only meaningful for `edit`). Read-only.
- For each affected account (one, or two for a transfer pair): `balance_before` = that account's `balance` from `AccountsService.findMine(userId)` (single source of truth for the formula — do not re-implement the SQL). `balance_after = balance_before - effect(current) + effect(proposed)` where `effect(row)` = `row.amount` if `lifecycle==='actual' && occurredOn <= today && !isBackdated(occurredOn, account.reference_date, account.opening_boundary)` else 0 (Decimal math). Proposed state: edit -> new amount/date, same lifecycle; void -> lifecycle voided; restore -> lifecycle actual.
- Response per account: `{ account_id, balance_before, balance_after, delta, within_opening_snapshot: boolean }` where `within_opening_snapshot = isBackdated(proposed or current occurredOn, ...)`; when true, `note` explains "dated on/before the account's reference date: stored for history, does not change the displayed balance" (spec §5: say it explicitly, never a silent zero). Top-level `{ transaction_id, action, accounts: [...] }`. No obligation/reconciliation sections.
- Tests: edit amount on a post-reference row -> delta equals amount change; same edit on a pre-reference row -> delta `"0"`, `within_opening_snapshot: true`, note present; void -> delta `-amount`; restore of voided -> `+amount`; transfer pair returns 2 accounts with deltas summing to 0; other user 404; endpoint performs no writes (version/lifecycle unchanged after call). Cross-check once against real `findMine` after actually applying the void: `balance_after` equals the post-void `balance`.

## Wrap-up

Update `docs/superpowers/specs/...epic16...` only if a decision deviates from it (record in the PR). Final: full `npm test` (expect only the 6 baseline reds), `npx tsc -p tsconfig.build.json --noEmit`, `npm run lint`.

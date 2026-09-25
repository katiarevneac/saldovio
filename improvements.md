# Saldovio — implementation, security, and debugging plan

Date: 2026-09-23  
Status: Planned — implementation has not started under this plan.  
Scope: All improvements from the project review, plus the security and operational work needed to support them.  
Document language: English, following the project's documentation convention.

## 1. Outcome and boundaries

Build a personal finance application that reliably answers: **“How much can I spend before my next payday while covering my commitments and preserving my chosen reserve?”**

The complete outcome includes accurate balances, usable transaction maintenance, trustworthy imports, paid/unpaid obligations, variable spending budgets, reconciliation, a shared forecast/simulation engine, accessible mobile UX, account recovery, security controls, automated checks, and recovery procedures.

Keep the accepted architecture: Next.js Web/BFF, NestJS Finance API, Python Analytics Service, PostgreSQL. Finance API owns persistence and authorization. Analytics remains stateless and has no database access. Transaction management must remain available when Analytics is unavailable.

Keep RON as the supported currency. Reject unsupported currencies explicitly. Bank connectivity, currency conversion, investment advice, credit models, monetization, and an AI chatbot remain outside this implementation plan; the review recommended postponing these rather than building them now.

This file is the requested implementation specification. Creating it does not mean the features have been implemented. Prepare deployment configuration and a reviewable release; execute external provisioning, paid services, production migrations, and publication under the applicable deployment authorization. Existing deployment notes explicitly separate configuration from making the application public.

### Completion policy

- Every phase below is in scope; priority determines order, not whether it gets implemented.
- A checkbox is complete only when its acceptance evidence exists.
- Use small branches/PRs and preserve unrelated local changes. Do not turn the entire roadmap into one change.
- Check current official framework documentation and the applicable repository instructions before each implementation step. Read the bundled Next.js documentation where required by `web/AGENTS.md`.
- Keep explanations to the user in Romanian and code, tickets, and project documentation in English.
- Record decision changes in concise ADRs. Do not silently reinterpret existing monetary data.

## 2. Baseline and evidence

The review inspected application source, Prisma models/migrations, financial calculations, authentication, import/export, tests, and planning documents. It did not establish production security, deployed behavior, or a complete browser/accessibility audit.

Observed test results:

| Suite | Result in the review | Interpretation |
|---|---|---|
| Web | 218/218 passed | Existing automated tests passed |
| Analytics | 19/19 passed | Existing calculator tests passed |
| Finance API, full run with DB access | 107 passed, 2 failed | Failures were database/test timeouts |
| Finance API, affected suites rerun serially | 12/12 passed | Suggests execution instability; does not establish its root cause |

The first sandboxed API attempt could not connect to localhost PostgreSQL. That environment failure is separate from the subsequent timeout findings. Do not report either as proof of a financial logic defect.

### Findings register

“Observed” means visible in the inspected code. Security items described as “verify” are investigation tasks, not claims of a demonstrated exploit.

| ID | Priority | Finding / behavior to verify | Starting point |
|---|---|---|---|
| F01 | P0 | Default account uses zero balance and today's reference date; today's transactions are excluded from its balance | `finance-api/src/users/users.service.ts`, `accounts/accounts.service.ts` |
| F02 | P0 | Current balance includes transactions after the reference date without an upper bound of today | `accounts/accounts.service.ts` |
| F03 | P0 | Paid transactions cannot be linked to recurring occurrences; today's or early-paid obligations can be counted again | `prisma/schema.prisma`, `analytics-service/forecast.py` |
| F04 | P0 | CSV currency is not restricted to RON | `transactions/csv/revolut-parser.ts` |
| F05 | P0 | Import classifies by amount sign; complete paired internal transfers are absent | Parser, transaction service, Prisma model |
| F06 | P1 | Merchant description disappears after import; bank operation type becomes the category | Parser, commit DTO, transaction model |
| F07 | P1 | Transaction correction, rule maintenance, and account archive flows are missing | Controllers, dashboard routes |
| F08 | P0 | Simulator can show an affirmative verdict with incomplete spending data | `web/lib/simulator.ts`, simulator components |
| F09 | P1 | Financial recurrence/forecast logic exists independently in multiple production modules | Python forecast, Web simulator and occurrence helpers |
| F10 | P0 | Monetary inputs use numbers; sign/scale/range/date validation is inconsistent | DTOs, Web schemas, serialization helpers |
| F11 | P0 | Verify manual-write retries, token claims, session invalidation, and login abuse protection | Auth guards, Auth.js config, transaction creation |
| F12 | P1 | Fetch calls lack explicit application deadlines; settings failure can fall back to default decision inputs | Web API clients and dashboard pages |
| F13 | P1 | All transactions are loaded; filters and summaries are computed in Web | Transaction service and explorer |
| F14 | P1 | Mobile shell has a fixed-width sidebar; browser behavior/accessibility remains unverified | Dashboard layout and Sidebar CSS |
| F15 | P1 | README is stale; CI/deploy are planned rather than implemented in inspected files | README and Epic 12 design |
| F16 | P0 | Verify CSV formula injection protection; current helper only performs CSV quoting | `transactions/csv/csv-escape.ts` |
| F17 | P0 | Test configuration can use the normal configured DB; one test expects existing users | Prisma service test and test bootstrapping |
| F18 | P1 | Commit accepts client-provided import rows and hashes; review integrity of preview-to-commit flow | Import DTO, service, Web actions |

P0: correctness, data integrity, or security prerequisite before real-data beta. P1: required usability/reliability improvement. P2: refinement after the core path works, still included below.

## 3. Delivery order and dependencies

Use this sequential delivery order for a single implementer. Security checks apply to every new endpoint, not just the dedicated security phases.

| Phase | Deliverable | Depends on |
|---|---|---|
| S00 | Safe reproducible test/debug environment | None |
| S01 | Baseline CI and evidence collection | S00 |
| S02 | Financial contracts and migration design | S00 |
| S03 | Correct account balances and onboarding foundations | S02 |
| S04 | Authentication, authorization, and service boundary hardening | S00; extend through later phases |
| S05 | Editable transactions and atomic internal transfers | S02–S04 |
| S06 | Reliable import, export, descriptions, and categories | S04–S05 |
| S07 | Obligations and recurring-payment matching | S05–S06 |
| S08 | One authoritative forecast and simulation engine | S03, S07 |
| S09 | Variable budgets, reserve, and spendable amount | S08 |
| S10 | Balance reconciliation and data freshness | S05–S09 |
| S11 | Purchase scenarios and saved comparisons | S08–S10 |
| S12 | Onboarding, dashboard, Romanian UI, mobile/accessibility | S03–S11 |
| S13 | Performance, failure handling, and observability | Baseline in S04; final pass after S12 |
| S14 | Recovery, privacy, release configuration, and documentation | S01–S13 |
| S15 | End-to-end security/regression gate and invited beta validation | S14 |

At each phase: define one user-visible outcome, implement it, verify it, document evidence, then proceed. Estimates should be added after S00 establishes the reproducible baseline; do not promise dates based only on file counts.

## 4. S00 — establish a safe test and debugging environment

Goal: make failures reproducible without risking development or personal records.

- [ ] S00.1 Record the current Git branch, commit, dirty files, runtime versions, service ports, and installed package versions. Never include secret values in the report.
- [ ] S00.2 Create a dedicated test database and test credentials with privileges restricted to it. Use a distinct test environment variable, not an implicit fallback to the development URL.
- [ ] S00.3 Fail test startup if the test database is not explicitly identified and isolated. Combine name checks with restricted credentials; a name suffix alone is insufficient protection.
- [ ] S00.4 Apply committed migrations to a clean test DB and seed deterministic users A/B, accounts, transactions, obligations, and dates. Never require pre-existing personal users.
- [ ] S00.5 Make teardown target records created by the current test run. If fixture creation fails, cleanup must not execute unscoped deletes with an undefined owner ID.
- [ ] S00.6 Split unit, database integration, HTTP integration, and browser tests into documented commands. The default unit command should not unexpectedly write to a personal database.
- [ ] S00.7 Add an injectable clock/business date to domain services and test helpers. Freeze date/time in financial tests; include Europe/Bucharest and UTC environments.
- [ ] S00.8 Diagnose the API timeouts: compare isolated and concurrent runs, inspect pool limits, connection acquisition, open clients, transaction duration, and teardown. Ensure every Prisma/Nest test context closes correctly.
- [ ] S00.9 Replace the “user count must be greater than zero” connectivity test with an assertion that works on a clean database or with a fixture the test owns.
- [ ] S00.10 Add a synthetic demo seed isolated from test and real-user data. Document a reproducible local start sequence and health checks.

Acceptance: the suite works from an empty test database, refuses a non-test target, leaves no run-owned records/connections behind, and the previously flaky suites pass three consecutive clean runs after the cause is addressed. Increasing timeout values alone is not a root-cause fix.

## 5. S01 — establish CI before broad implementation

- [ ] S01.1 Add CI jobs for Web, Finance API, and Analytics using lockfiles and documented runtime versions. Pin Python dependencies reproducibly; requirements are currently unpinned.
- [ ] S01.2 Run type checks, lint, relevant unit tests, API integration tests with a disposable PostgreSQL service, and clean application builds. Check generated Prisma client creation from a fresh checkout.
- [ ] S01.3 Add Python lint/type checking proportionate to the service and keep its financial tests in the required gate.
- [ ] S01.4 Trigger checks on PRs and protected main-branch changes; reconcile this expansion with the older PR-only CI design in an ADR. A branch bypass must not produce an unverified release.
- [ ] S01.5 Configure required checks and branch protection where repository permissions allow. Store minimal CI permissions and do not expose secrets to untrusted PR code.
- [ ] S01.6 Scan dependencies and tracked history for secrets; investigate findings and rotate any confirmed exposed secret. Never print detected secret values in public logs.
- [ ] S01.7 Verify the gate once with a deliberate failing test in a disposable branch, then remove the deliberate failure.

Acceptance: a clean checkout can run the required checks, a failing check blocks the normal merge path, and the check configuration is committed. Browser and migration gates are added as those capabilities arrive.

## 6. S02 — define financial contracts before schema changes

Produce `docs/financial-rules.md`, a versioned API contract, and ADRs for the following decisions.

- [ ] S02.1 Monetary transport: decimal strings with at most two fractional digits for RON. Parse/validate before conversion. Use Decimal or bounded integer minor units for authoritative arithmetic; document maximum values and safe aggregate limits.
- [ ] S02.2 Transaction convention: positive income, negative expense, signed transfer legs, explicit adjustment type. Reject zero-value financial entries unless a separately specified operation needs them. Enforce the same rule in API and DB constraints.
- [ ] S02.3 Dates: strict real calendar dates, a single business timezone, and an explicit calculation date passed through the request. Do not derive “today” independently in each service.
- [ ] S02.4 Opening balance: retain existing accounts' inclusive reference-date interpretation during migration. For new date-only accounts, use an explicit opening-at-start-of-day convention so today's entries affect today's balance. Store the convention rather than silently changing old rows.
- [ ] S02.5 Current balance: opening snapshot plus applicable posted, non-voided entries through the calculation date. Planned future entries never affect the actual current balance.
- [ ] S02.6 Projection interval: retain `[calculationDate, windowEnd)` for events; document the final chart point. Treat starting available cash separately so a salary expected later today cannot hide an immediate purchase shortfall.
- [ ] S02.7 Reserve is a minimum retained amount; variable spending is a forecast outflow. Rename the old `essentialSpend` setting to a clear reserve concept without silently creating a spending budget from it.
- [ ] S02.8 Define actual, planned, paid, overdue, skipped, voided, adjustment, and transfer semantics. Clarify which affect cash, income/expense reports, or projection only.
- [ ] S02.9 Define totals across all accounts versus available-to-spend accounts. Protected savings contribute to total assets but not automatically to purchase affordability.
- [ ] S02.10 Define rounding and allocation rules. Split a budget across days in integer bani with an explicit remainder rule so daily allocations sum exactly to its total.

### Target model, introduced incrementally

| Entity/change | Minimum purpose |
|---|---|
| User settings | Business timezone, locale, reserve amount, forecast preference, onboarding state, session version |
| Account additions | Opening-boundary convention, account purpose, spending eligibility, archived state, freshness metadata |
| Transaction additions | Description, category reference, source, lifecycle state, timestamps, version, transfer/import/occurrence linkage |
| Category and categorization rule | User-owned or system-defined classification with stable IDs |
| Transfer | Atomic source/destination operation with two linked ledger entries |
| Recurring rule version | Effective dates, amount, frequency, account, future-change behavior |
| Obligation occurrence | One dated expected payment/income, status, outstanding amount, rule-version identity |
| Payment match | Explicit allocation between posted transaction and occurrence; supports partial fulfillment |
| Import batch and staged row | User/account-bound preview, expiry, selected rows, parser/fingerprint version, commit result |
| Budget | Period, covered categories, available-account scope, planned variable amount |
| Reconciliation | Observed balance/date, calculated balance, difference, resolution/adjustment linkage |
| Scenario | Owner, named inputs, purchase date/account, snapshot metadata, formula version |
| Idempotency record | Owner, operation, key, normalized payload hash, result and retention |
| Security tokens/audit | Hashed recovery tokens, session revocation support, minimal event records |

Acceptance: independent worked examples resolve every rule, schemas and constraints are agreed in ADRs, and the migration strategy preserves existing balance semantics.

## 7. S03 — correct balances and account initialization

- [x] S03.1 Add regression tests for new-user same-day income/expense and for existing inclusive snapshots before modifying the calculation.
- [x] S03.2 Stop silently presenting the auto-created zero account as a configured financial situation. Mark it unconfigured and complete it through onboarding, or replace it through a controlled migration path.
- [x] S03.3 Apply opening-boundary semantics and an upper calculation-date bound to current balance queries. Exclude voided/planned records. **Gap found and fixed 2026-09-25: `AccountsService.findMine`'s balance SQL had the opening-boundary and upper-bound halves but never filtered `lifecycle = 'actual'` — a `planned` transaction dated today or earlier (creatable via direct API call; not reachable from the web UI, which doesn't expose a `planned` option yet) would have inflated the balance. Fixed by adding `t.lifecycle = 'actual'` to the FILTER clause, with a regression test.**
- [x] S03.4 Accept past history for reporting while explaining which entries are already represented in the opening snapshot. Show the effect before saving/importing backdated entries.
- [x] S03.5 Prevent future-dated actual transactions; offer a planned item instead. Review existing future entries explicitly rather than silently recategorizing all of them.
- [x] S03.6 Provide account name/purpose editing, protected-savings configuration, and archive/unarchive. Archiving hides an account from routine selection; it must not silently erase its money/history from consolidated reporting.
- [x] S03.7 Route opening-balance corrections on active accounts through a previewed reconciliation/adjustment flow. Do not overwrite snapshots without showing downstream impact.

Acceptance examples: a newly configured start-of-day zero account plus today's 1,000 RON income becomes 1,000 RON; a legacy inclusive snapshot stays unchanged by already-included same-day history; tomorrow's planned 200 RON expense leaves actual cash unchanged today.

## 8. S04 — authentication, authorization, and service security

Implement the controls below, then extend the negative tests whenever a new resource is added. The design follows request-level authorization and least privilege described by [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### Identity and sessions

- [ ] S04.1 Add startup validation for required secrets, URLs, environment, and production cookie settings. Missing or empty secrets must prevent startup; do not log their values.
- [ ] S04.2 Verify internal JWTs against an explicit algorithm, issuer, audience, expiry, and valid positive user identifier. Require essential claims; reject malformed subjects and inactive/deleted users. Keep keys server-only and document rotation.
- [ ] S04.3 Define revocation for Auth.js JWT sessions using a checked session version or equivalent server-side state. Password reset, account deletion, and “sign out all devices” must invalidate prior sessions. Account for the remaining lifetime of any issued internal token.
- [ ] S04.4 Rate-limit login, signup, recovery, import, and expensive calculation routes. Use durable/shared limits for multiple instances and validate trusted proxy handling so forged forwarded IPs cannot bypass limits.
- [ ] S04.5 Keep external authentication/recovery responses generic and inspect timing differences. Review password length handling, including bcrypt byte limits; never silently truncate passwords. Verify framework recommendations before changing hashing configuration.
- [ ] S04.6 Implement password change and account recovery. Use random, hashed-at-rest, short-lived, single-use tokens; enforce expiry, rate limits, atomic consumption, trusted reset URLs, and session revocation.
- [ ] S04.7 Add email verification before real-data beta and define behavior for unverified accounts. Use a local mail sink for tests; select/configure a real delivery service at the release stage.

Authentication abuse controls are informed by [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Recovery-token handling follows [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### Resource and network boundaries

- [ ] S04.8 Authorize every read/write by the authenticated owner, including nested objects, previews, transfers, matches, scenarios, budgets, exports, and recovery-related actions. Never accept a browser user ID as authority.
- [ ] S04.9 Use owner-scoped queries and transaction-level checks. For transfers and matches, verify all referenced objects belong to the same user and have compatible account/currency semantics.
- [ ] S04.10 Keep database/API credentials separate by environment. Restrict the runtime database role; use a separate migration role where supported.
- [ ] S04.11 Make Analytics private or require service authentication, with bounded request sizes, rule/event counts, numeric ranges, and computation horizons. Stateless computation still needs abuse protection when exposed.
- [ ] S04.12 Disable unnecessary Finance API CORS or narrowly configure actual browser consumers. Document that CORS is not authorization and server-to-server requests are not protected by browser-origin rules.
- [ ] S04.13 Validate CSRF/origin behavior for Server Actions and session-authenticated state changes, HTTPS, secure/HttpOnly/SameSite cookies, trusted hosts, and safe redirects using the installed framework version.
- [ ] S04.14 Add tested security headers and a CSP compatible with Next.js/chart rendering. Roll out CSP in report-only mode first; remove accidental sensitive data from reports.
- [ ] S04.15 Bound text lengths, arrays, file sizes, pagination sizes, and numeric inputs. Convert expected validation/database errors into controlled responses without stack traces, SQL, tokens, or personal records.
- [ ] S04.16 Verify financial HTML/API/export responses cannot be cached across users. Apply appropriate private/no-store behavior and test shared-device logout/back navigation.

Acceptance: user B cannot access or modify any of user A's resource types by changing identifiers. Invalid/expired/wrong-audience tokens fail. Reset tokens cannot be reused. Revoked sessions cannot perform new writes. No secret appears in browser bundles, logs, errors, or CI artifacts. Add a dated threat model listing remaining limitations; do not label the product “secure” based only on passing unit tests.

## 9. S05 — maintainable transactions and atomic transfers

- [ ] S05.1 Add transaction description, merchant display, category ID, source, timestamps, and version. Preserve imported source identity when users edit presentation fields.
- [ ] S05.2 Implement editing and void/restore flows with an impact preview for reconciled or matched records. Keep a minimal change history; profile deletion must also purge user-linked history according to the retention policy.
- [ ] S05.3 Validate sign, scale, range, account ownership, archived-account state, and real calendar dates server-side and in DB constraints. Map invalid dates to a client error rather than a generic server failure.
- [ ] S05.4 Add idempotency to manual financial mutations. Scope keys to user and operation, verify the payload fingerprint, persist result atomically with the write, and reject key reuse for different content.
- [ ] S05.5 Preserve the same operation key across retries after an uncertain network outcome. A fresh user intent receives a fresh key. Button disabling is only a UX aid.
- [ ] S05.6 Add internal transfers with source, destination, positive amount, date, and linked equal/opposite entries. Reject identical accounts, incompatible states, and foreign ownership.
- [ ] S05.7 Commit or roll back both transfer legs together. Editing/voiding must operate on the pair; direct modification of an individual leg must be rejected.
- [ ] S05.8 Exclude transfers and reconciliation adjustments from income/expense totals. Include their cash effects correctly per account. Moving money into protected savings changes spendable cash without creating an expense.
- [ ] S05.9 Prevent lost edits with optimistic version checks and a clear conflict response. Coordinate edit/void with occurrence matches and reconciliation validity.

Acceptance: repeated identical requests create one operation; two concurrent edits cannot silently overwrite each other; a 500 RON internal transfer preserves the consolidated total; injected failure between transfer legs leaves neither leg committed.

## 10. S06 — reliable CSV import/export and categorization

- [ ] S06.1 Validate headers, encoding/BOM, delimiter support, quoting, real dates, amounts, row count, and RON currency. Return per-row reasons without importing unsupported currencies as RON.
- [ ] S06.2 Enforce resource limits before/during parsing, not just after parsing the entire file. Account for multipart overhead across Web, API, hosting, and proxy limits. Test the actual maximum allowed file through all layers.
- [ ] S06.3 Persist descriptions/merchant text and original bank operation type separately from the user's category. Do not invent merchant data for old rows where the description was discarded.
- [ ] S06.4 Add standard/user categories, manual recategorization, and deterministic user-owned categorization rules. Show suggestions for confirmation and support bulk correction without losing source identity.
- [ ] S06.5 Represent ambiguous top-ups/transfers as needing classification. Suggest possible internal pairs based on owned accounts, amount, and dates; require confirmation instead of assuming every positive value is earned income.
- [ ] S06.6 Replace trusted client hashes/amounts with a server-staged preview batch, bound to user and account. Commit selected server row IDs, validate batch ownership/expiry, and allow only explicitly supported edits.
- [ ] S06.7 Version fingerprints and retain original bank identifiers only when actually present. Handle reimport, overlapping statements, harmless formatting changes, and legitimately identical rows without claiming perfect deduplication.
- [ ] S06.8 Validate duplicate/conflict decisions again inside commit. Make batches atomic, retry-safe, and concurrency-safe using appropriate unique constraints and operation keys.
- [ ] S06.9 Include before/after balance impact, ignored history, rejected rows, and duplicate counts in preview. Make fee handling explicit and verify against a sanitized known statement fixture; do not assume every export format treats fees identically.
- [ ] S06.10 Add batch history and “undo import” with a preview. If imported rows have been edited, matched, or reconciled, require a controlled resolution rather than blind deletion.
- [ ] S06.11 Put import in Transactions as well as Settings. Preserve filters after importing, and make an uncertain commit result recoverable from batch history.
- [ ] S06.12 Harden CSV export against spreadsheet formula interpretation in free-text fields. Keep numeric amounts semantically numeric. Test commas, quotes, CR/LF, formula prefixes, leading controls, and target spreadsheet applications. Preserve original data in a separate structured JSON export.
- [ ] S06.13 Export all user-owned data needed for portability: accounts, transactions, categories, rules/occurrences, budgets, settings, and scenarios. Clearly distinguish transaction CSV from complete account export.
- [ ] S06.14 Delete temporary raw uploads/staged content after a documented retention period. Avoid logging row contents. If stored outside the DB, use private access and unguessable object keys.

Upload boundary choices should be checked against [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Ordinary CSV quoting does not prevent spreadsheet formulas; mitigation and round-trip limitations must be documented using [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).

Acceptance: mixed-currency rows cannot silently enter RON accounts; repeated and concurrent imports do not duplicate entries; descriptions survive save/export; a tampered commit cannot replace staged values; opening an exported malicious text fixture does not execute a formula in supported applications.

## 11. S07 — obligations, recurrence changes, and payment matching

- [ ] S07.1 Add rule start/end dates, effective versions, pause/resume/archive, and explicit monthly day clamping. Implement weekly and annual frequencies as well as monthly so ordinary recurring expenses can be represented.
- [ ] S07.2 Materialize occurrences with stable unique identities. Repeated generation must not create duplicate obligations. Rule edits change future unpaid occurrences only; preserve already paid/history-linked instances.
- [ ] S07.3 Support planned, partially paid, paid, overdue, postponed, and skipped states. A postponed occurrence retains its identity and audit history.
- [ ] S07.4 Create one-off planned expenses/income through the same occurrence model, covering future transactions rejected by S03.
- [ ] S07.5 Link existing/imported transactions to occurrences using explicit allocations. Prevent over-allocation of a transaction or obligation. Support a bill paid in parts and several bills covered by one payment.
- [ ] S07.6 “Mark paid” either links an existing transaction or atomically creates and links a new posted transaction. It must never simply hide a forecast expense without explaining its effect on cash.
- [ ] S07.7 Suggest matches using account, type, amount, and date proximity. Never silently confirm uncertain matches. Display amount/date differences.
- [ ] S07.8 Model refunds/reversals explicitly; editing or voiding a matched payment must update outstanding obligations or flag a conflict.
- [ ] S07.9 Define overdue handling: show unpaid obligations and include them conservatively at the start of the projection, labelled with the assumption, unless the user reschedules/skips them.
- [ ] S07.10 Add a bills calendar/list, upcoming obligations, overdue notices, and rule management. Use in-app notifications first; do not make email reminders a hidden dependency.

Acceptance: paying today's rent or paying it early reduces the actual balance once and removes only its settled amount from future outflows. Partial payments leave only the remainder. Pause/resume and rule edits cannot rewrite paid history.

## 12. S08 — one authoritative financial calculation engine

- [ ] S08.1 Extend the versioned Analytics contract to accept explicit dated cash events, calculation date, starting balance by relevant account/scope, reserve, and a bounded window. Validate request and response shapes at service boundaries.
- [ ] S08.2 Make Finance API responsible for ownership, consistent data extraction, and resolving persisted occurrence state. Analytics owns projection/simulation arithmetic. Web orchestrates rendering and requests rather than maintaining a second authoritative forecast.
- [ ] S08.3 Move authoritative purchase simulation out of `web/lib/simulator.ts` into Analytics. Retain presentation-only transformations in Web. Use independent expected-result fixtures as the cross-check rather than three competing production engines.
- [ ] S08.4 Share canonical forecast inputs between baseline and purchase scenario. Return daily balances, current starting availability, minimum/date, end balance, event explanations, formula version, calculation timestamp, and input completeness.
- [ ] S08.5 Keep current recurrence clamping and interval boundary behavior explicit. Unify the payday/window decision in one domain location and pass it through; do not calculate it separately with different clocks.
- [ ] S08.6 Include today's starting cash as a possible minimum before future expected inflows. Explain that daily aggregation does not prove an intraday payment ordering.
- [ ] S08.7 Return unavailable/incomplete states when inputs are missing or invalid. Never fall back silently from an unavailable saved reserve to the old 10%-of-balance rule for a confident purchase verdict.
- [ ] S08.8 Distinguish total-asset projections from spendable-cash projections. A transfer into/out of an excluded account changes only the appropriate scope.
- [ ] S08.9 During rollout, compare old/new results on synthetic and sanitized fixtures, classify intentional differences, then remove obsolete production logic after the new path is verified.

Acceptance: overview, forecast, and simulator use the same inputs/formula and agree to the cent. Analytics downtime leaves transaction CRUD available and marks calculation panels unavailable. Responses identify their assumptions and version.

## 13. S09 — variable budgets, reserve, and spendable amount

- [ ] S09.1 Split reserve settings from variable-spending budgets in storage and UI. Migrate the old setting as a reserve with an explanatory notice; do not deduct it as a second expense.
- [ ] S09.2 Add weekly/monthly variable budgets by category and a simple overall budget option. Show consumed amount and remaining planned spending.
- [ ] S09.3 Avoid double counting: fixed matched bills are represented by obligations, posted spending is already in the current balance, and variable projection contains only remaining planned spending for the applicable period.
- [ ] S09.4 Allocate the remaining budget over remaining dates using exact minor units and a documented remainder rule. Handle overspent categories without creating negative future expense amounts.
- [ ] S09.5 Calculate the additional immediate spendable amount from the minimum projected spendable balance minus the reserve, bounded by available cash now. Show any existing shortfall separately instead of hiding it behind a zero result.
- [ ] S09.6 Add a completeness checklist: configured/reconciled accounts, income/obligations, variable-spend assumption, reserve, and freshness. Let users explicitly confirm a zero budget; do not mistake a missing value for zero.
- [ ] S09.7 Replace unconditional “affordable” wording with a conditional result and explanatory amounts/dates. With incomplete inputs, show a provisional estimate and the missing items.
- [ ] S09.8 Add an opt-in history-based budget suggestion after enough complete periods exist. Start with a transparent calculation over user-selected complete weeks, excluding transfers, adjustments, refunds handled by the category policy, and fixed obligations. Show included periods, sample size, and exclusions; user confirms the resulting budget.
- [ ] S09.9 Add low-balance/reserve-breach notices showing date, amount, and driving events. Avoid invented probability/confidence percentages.

Worked oracle: current spendable balance 3,000 RON; before payday, unpaid fixed bills total 1,200 RON and remaining variable budget totals 600 RON; no intervening income; reserve 500 RON. Minimum projected balance is 1,200 RON, so additional immediate spendable amount is 700 RON. Moving another 200 RON into protected savings reduces that amount to 500 RON, without increasing reported expenses.

Acceptance: every number in the spendable calculation can be traced to an input. Missing data never produces a misleading affirmative verdict; reserve and budgets are not subtracted twice.

## 14. S10 — reconciliation and data freshness

- [ ] S10.1 Allow users to record an observed account balance and its effective date/cutoff. Compare it to the application's balance on the same basis.
- [ ] S10.2 Show the exact difference and contributing entries. Suggest missing/duplicate/import-boundary investigations; do not invent an explanation automatically.
- [ ] S10.3 Resolve by correcting an entry, completing a transfer, changing an explicitly wrong opening snapshot through a preview, or creating an explained balance adjustment.
- [ ] S10.4 Keep adjustments separate from income/expenses and retain their reason and reconciliation reference.
- [ ] S10.5 Preserve reconciliation history and invalidate/reopen affected checks when past transactions change. Display this consequence before editing.
- [ ] S10.6 Track and show last import, last user verification, and last reconciliation separately. An import today does not prove that every account is complete through today.
- [ ] S10.7 Surface stale/mismatched accounts in dashboard and decision results. Offer a direct action to refresh/reconcile.

Acceptance: application 2,510 RON versus observed 2,430 RON produces an explained -80 RON difference; an adjustment resolves cash without creating an ordinary expense. Later editing an affected transaction marks the old reconciliation stale.

## 15. S11 — purchase date and saved scenarios

- [ ] S11.1 Add purchase date, paying account, amount, and optional note. Apply the expense from the chosen date rather than always from today.
- [ ] S11.2 Compare buying now, buying after payday, and an alternative user-selected date over one comparable horizon. Extend the comparison window explicitly if a purchase is outside it; never ignore an out-of-window purchase silently.
- [ ] S11.3 Show minimum/date, reserve gap, end balance, paying-account shortfall, and total spendable impact. An aggregate surplus must not hide insufficient cash in the payment account.
- [ ] S11.4 Add optional recurring ownership costs, such as a subscription, using explicit amount/frequency/start date assumptions.
- [ ] S11.5 Save named scenarios with owner, inputs, formula version, and calculation metadata. Reopening an old result labels it as a snapshot and offers recalculation against current data.
- [ ] S11.6 Provide scenario rename/delete and comparisons. A scenario never posts real transactions; converting it into a planned purchase requires an explicit user action.
- [ ] S11.7 Debounce requests and cancel/ignore stale responses so fast slider changes cannot display results for an older amount. Include loading, error, and stale-result states.

Acceptance: a purchase next week changes only balances from that date onward; baseline and alternatives use equivalent assumptions; saving a scenario never changes actual cash.

## 16. S12 — usable onboarding, dashboard, mobile, and accessibility

- [ ] S12.1 Build resumable onboarding: account and opening balance/date, income and next payday, bills, variable budget, reserve, and a review of assumptions. Avoid creating duplicate accounts/rules on retries or back navigation.
- [ ] S12.2 Explain that payday controls a window and does not itself create income. Where onboarding creates a salary rule, show its amount/account/date and ask for explicit confirmation within the flow.
- [ ] S12.3 Permit skipped steps while clearly marking calculations provisional. Replace blank dashboards with actionable setup states.
- [ ] S12.4 Reorder dashboard content around spendable amount, lowest-balance date, next three obligations, data freshness, and a purchase simulation entry point. Keep historical KPIs available lower down.
- [ ] S12.5 Implement Romanian user-facing copy and consistent RON/date formatting. Keep a translation structure that can support English without embedding mixed languages throughout components.
- [ ] S12.6 Add transaction filters for account, date range, category, type, source, and lifecycle; search description/merchant. Persist filters in the URL and preserve them after edits/imports.
- [ ] S12.7 Replace the fixed desktop-only shell with a mobile navigation pattern. Verify 320/375/768/1280 px widths, zoom, long names, large balances, forms, import previews, tables, and charts.
- [ ] S12.8 Verify keyboard navigation, visible focus, labels, error associations, modal focus trap/restore, escape behavior, contrast, touch targets, reduced motion, and screen-reader announcements.
- [ ] S12.9 Provide accessible textual/tabular alternatives for charts and never rely only on red/green. Test with a screen reader as well as automated checks.
- [ ] S12.10 Add clear confirmations/undo where appropriate, preserve form input after errors, distinguish no-data from no-results, and explain corrections/voiding with financial effects.

Acceptance: a new user can configure one account and a meaningful forecast without external instruction; core daily flows work on a narrow phone viewport and keyboard; no inaccessible chart is the only source of financial information.

## 17. S13 — performance, resilient requests, and observability

- [ ] S13.1 Add stable cursor pagination and server-side filters/search with bounded page size. Include a deterministic ID tie-breaker and validate cursor/filter inputs.
- [ ] S13.2 Move balance/monthly summary aggregation to owner-scoped Finance API queries using the financial rules. Use a consistent read snapshot for interdependent forecast inputs where necessary.
- [ ] S13.3 Measure query plans on synthetic 1k/10k/100k transaction datasets. Add justified owner/account/date/category indexes and verify their effect; avoid indexing every field without evidence.
- [ ] S13.4 Define per-hop request deadlines and cancellation. Retry reads only within a bounded budget; retry writes only with working idempotency. Distinguish validation, authorization, unavailable service, and unknown write outcome.
- [ ] S13.5 Load forecast panels independently so a slow Analytics call does not block the transaction/dashboard shell. Keep user-specific settings failures visible rather than substituting unsafe decision inputs.
- [ ] S13.6 Add request/correlation IDs, structured redacted logs, readiness/liveness checks, and metrics for errors, latency, DB acquisition, import failures, and calculation availability. Health responses reveal no sensitive configuration.
- [ ] S13.7 Use generic operational error reports and small reproducible synthetic fixtures. Keep passwords, tokens, balances, CSV rows, merchant descriptions, and reset links out of operational telemetry by default.
- [ ] S13.8 Establish measured warm-request targets on a documented environment. Initial engineering targets: p95 paginated reads under 500 ms, bounded 365-day forecast under 1 s, and usable dashboard shell under 2 s; revise based on measured hosting constraints and record cold-start results separately.
- [ ] S13.9 Verify runtime/package compatibility, stale comments, unused code, duplicate types, and generated-file hygiene. Resolve meaningful framework warnings after correctness work; avoid unrelated mass upgrades.

Acceptance: a slow/unavailable calculator does not freeze core CRUD; paginated queries remain owner-scoped; latency is measured rather than asserted; telemetry can explain a failure without exposing financial data.

## 18. S14 — recovery, privacy, deployment configuration, documentation

- [ ] S14.1 Implement and test automated encrypted backups and restricted access. Document retention and separate restore credentials.
- [ ] S14.2 Restore into a fresh isolated database, apply compatible migrations, and compare record counts plus independent per-account balance checksums. Record restore time and evidence.
- [ ] S14.3 Set explicit initial beta recovery targets: at most 24 hours of data loss and restoration within 4 hours. These are proposed operating targets, not promises until a drill proves them; tighten them if product usage requires it.
- [ ] S14.4 Finish complete export and account deletion across all new entities, temporary uploads, recovery tokens, scenario snapshots, sessions, and user-linked audit data. Handle backup retention transparently and prevent deleted accounts from being resurrected accidentally during restore.
- [ ] S14.5 Write a data inventory and plain-language privacy/retention policy matching actual behavior. Review applicable obligations before public real-data use; do not claim legal compliance from a code checklist.
- [ ] S14.6 Replace hardcoded service URLs with validated environment configuration. Document Web/API ports, required variables, migrations, readiness, proxy/TLS behavior, and environment isolation using secret-free examples.
- [ ] S14.7 Prepare deployment manifests/configuration, synthetic demo data, build/start commands, and a migration/release runbook. Re-verify hosting terms and technical limits when selecting the actual release environment.
- [ ] S14.8 Ensure releases use verified commits/artifacts and cannot auto-deploy ahead of required checks. Add post-release smoke tests and an explicit rollback/forward-fix decision procedure.
- [ ] S14.9 Update README to describe the current product, architecture, local start, tests, known limitations, financial assumptions, demo, and roadmap. Update stale CLAUDE/brief references through clearly dated status notes.
- [ ] S14.10 Add concise ADRs for money/date contracts, opening balances, the authoritative engine, matching, session revocation, and deployment. Include a data-flow diagram and operator debugging guide.

Acceptance: a clean machine can follow the setup guide; a fresh restore meets the measured recovery target; demo and real data are separated; deployment configuration contains no real secrets; documentation distinguishes implemented and planned behavior.

## 19. S15 — full regression, security gate, and product validation

- [ ] S15.1 Add browser E2E flows against disposable services: signup/verification, onboarding, same-day transactions, corrections, transfer, import/reimport, bill matching, budget, reconciliation, simulation, export, recovery, and deletion.
- [ ] S15.2 Run authorization tests for every resource/operation using users A/B, including nested IDs and mutation races. Test route/page protection and direct API/Server Action access separately.
- [ ] S15.3 Run the debugging matrix below and attach evidence. Use real service boundaries for at least the critical flows, not only mocked component tests.
- [ ] S15.4 Inject Analytics outage, Finance API outage, DB disconnect, delayed responses, expired sessions, duplicate submissions, lost commit responses, and concurrent edits.
- [ ] S15.5 Validate migration from a sanitized copy of the old schema and from an empty DB. Compare balances before/after migration and review every intentional discrepancy.
- [ ] S15.6 Complete mobile, keyboard, screen-reader, and export-opening checks on supported applications/browsers. Remove diagnostic artifacts containing test credentials before sharing.
- [ ] S15.7 Close all P0 issues and any P1 that blocks the complete core journey. Record remaining lower-risk limitations with owner and next action; the full plan is not complete while required phase work is outstanding.
- [ ] S15.8 Run an invited pilot with 5–10 consenting users after the technical gates. Observe at least one salary cycle; keep demo-only access available separately.
- [ ] S15.9 Measure setup completion/time, reconciliation discrepancies, return before purchase decisions, misleading-verdict reports, import success, and recovery/support incidents. Do not collect raw financial details for product analytics.
- [ ] S15.10 Resolve feedback-driven defects and document whether the central spending question is useful. Treat interviews/observed behavior as evidence; avoid claiming product validation from a small retention percentage alone.

Acceptance: the end-to-end journey is repeatable, no known material balance/double-counting/ownership defect remains, recovery is demonstrated, and pilot feedback has produced a documented follow-up decision.

## 20. Detailed debugging procedure

For every defect, create a record with ID, affected commit/environment, synthetic input, expected result calculated independently, actual result, request ID, smallest reproduction, root cause, fix, regression test, and remaining uncertainty.

1. Reproduce with the smallest deterministic fixture and a fixed clock. Preserve original evidence; do not “fix” the fixture to match the application.
2. Trace Browser → Server Action/BFF → Finance API → DB → Analytics → UI. Identify the first boundary where values differ.
3. Inspect values in their original units: decimal strings, integer bani, date-only strings, timezone, ownership, transaction state, and occurrence identity.
4. Write one falsifiable hypothesis. Add minimal temporary redacted instrumentation or an isolated query to test it.
5. Check an independent oracle: hand-calculated expected balances, conservation of transfers, or a minimal SQL projection in the isolated fixture DB.
6. Correct the rule at its authoritative layer; do not patch only the display while leaving stored/returned values wrong.
7. Add a regression test at the failing boundary plus an end-to-end case when the defect spans services.
8. Run affected tests, then required checks. Repeat broader testing only for changes/failures that justify it.
9. Remove temporary instrumentation, attach evidence, update documentation, and verify migration/recovery implications.

### Debugging and regression matrix

| ID | Reproduction / injection | Required result | Investigate first |
|---|---|---|---|
| D01 | New start-of-day account at 0; add today's +1,000 | Current balance 1,000 | Opening convention, SQL date predicate |
| D02 | Legacy end-of-day snapshot 1,000; import same-day -100 already included | Current balance remains 1,000 | Migration mapping, import preview explanation |
| D03 | Add tomorrow's planned -200 | Actual cash unchanged; projection falls tomorrow | Transaction/occurrence lifecycle, upper date bound |
| D04 | Record today's rent and link today's obligation | Actual cash reduced once; no duplicate projected payment | Match allocation, remaining occurrence amount |
| D05 | Pay next week's bill early | No second subtraction next week | Stable occurrence identity and allocation |
| D06 | Bill 300; payment 100; then void payment | Outstanding 200, then 300; actual cash restored | Atomic match/void transaction |
| D07 | CSV contains RON, EUR, USD | Unsupported rows explicitly rejected/skipped | Currency validation before staging |
| D08 | Repeat/overlap/concurrently commit a CSV | Exactly one supported transaction per confirmed source identity | Fingerprint version, unique constraints, idempotency |
| D09 | Two legitimate identical-looking payments | No silent loss; ambiguity surfaced | Over-aggressive dedupe logic |
| D10 | Transfer 500 A→B; inject failure after first leg | Total unchanged; rollback leaves no half transfer | DB transaction scope and constraints |
| D11 | Import transfer/top-up from own other account | No fabricated income/expense | Classification and confirmed pairing |
| D12 | Decimal 0.10 + 0.20; 1.001 input; extreme aggregate | Exact 0.30; invalid scale rejected; overflow prevented | JSON contracts, Decimal/minor-unit bounds |
| D13 | February 30 input; monthly day 31; leap year | Invalid actual date rejected; recurrence clamps as specified | DTO/calendar validation and engine |
| D14 | Bucharest midnight with servers running in UTC | All services use the same requested business date | Clock/timezone propagation |
| D15 | Salary today but insufficient cash before salary arrives | Immediate availability constraint visible | Starting minimum and intraday assumptions |
| D16 | Window ends on payday | Events on exclusive end excluded consistently | Window policy and UI date labels |
| D17 | Missing budgets, settings outage, stale account | Provisional/unavailable decision, no confident fallback | Completeness propagation and error boundaries |
| D18 | Protected savings and transfer out of spending account | Total assets preserved, spendable amount reduced | Account scope and event inclusion |
| D19 | Actual budget consumption plus fixed bills | No second deduction of already posted/matched spending | Budget remaining calculation and exclusions |
| D20 | Future purchase outside current horizon | Extend horizon explicitly or reject with explanation | Scenario contract and chart bounds |
| D21 | User B submits A's account/batch/scenario/match IDs | No disclosure, no write | Owner-scoped lookup and nested checks |
| D22 | Expired/wrong-issuer JWT; missing subject; deleted user | Request rejected predictably | Guard and session version checks |
| D23 | Reuse reset link; use old session after reset | Both rejected after successful reset | Atomic token consumption and revocation |
| D24 | Malicious text in merchant/category/name, then render/export | Escaped display; no formula execution in supported CSV viewers | Rendering and export text policy |
| D25 | Oversized/malformed CSV or huge event array | Bounded controlled error, no partial data | Limits at proxy, Web, API, parser, Analytics |
| D26 | Double click; write succeeds but response is lost | Retry resolves to original result | Operation key lifecycle and result persistence |
| D27 | Two edits from stale copies | One succeeds; other gets conflict, not silent overwrite | Optimistic version condition |
| D28 | DB calculated 2,510 vs observed 2,430 | -80 reconciliation difference explained | Snapshot cutoff, missing/duplicate entries |
| D29 | Slow/dead Analytics | Core transactions still usable | Fetch deadlines and independent rendering |
| D30 | Empty test DB and concurrent test workers | Deterministic fixtures, bounded pools, safe teardown | Test bootstrap, clients, lock contention |
| D31 | Delete profile, then use old links/tokens | Data access denied; new entities removed | Cascades, files, caches, sessions |
| D32 | Restore backup containing previously deleted profile | Deletion policy reapplied before serving traffic | Recovery runbook and deletion records |

### Failure classification

- Environment: denied local socket, missing service, wrong test URL, unsupported runtime. Fix the environment; do not alter business logic to make the error disappear.
- Test lifecycle: leaked connections, shared fixtures, race-dependent cleanup, frozen-time mistakes. Fix isolation and teardown before raising limits.
- Contract: number/string mismatch, invalid response shape, timezone or sign mismatch. Add boundary validation and a contract regression.
- Domain: wrong snapshot interpretation, duplicated obligation, transfer treated as expense. Fix the model/rule and independently verify historical effects.
- UX: stale result, hidden assumptions, discarded form data, inaccessible control. Verify through a real browser flow, not only a unit assertion.
- Security: cross-user access, replay, uncontrolled resource consumption, secret disclosure. Stop the affected release path, preserve redacted evidence, fix the boundary, and add a negative regression.

## 21. Migration and rollback procedure for every data-changing phase

1. Inventory affected tables/rows and write pre-migration balance/integrity queries.
2. Back up and rehearse restore in an isolated environment before changing real data.
3. Prefer additive columns/tables and explicit version fields first. Keep old readers compatible during the transition.
4. Backfill in bounded, restartable batches with validation counts. Keep unresolved ambiguous rows visible for review.
5. Compare per-account current balances, transfer conservation, occurrence allocations, dedupe counts, and total record ownership before/after.
6. Switch readers/writers behind a temporary rollout flag where useful. Do not dual-write without a tested reconciliation strategy.
7. Observe errors and compare results; remove obsolete fields/code in a later migration after the retention/rollback window.
8. For rollback, distinguish reverting code from undoing data. Do not restore an old backup over newer user writes without a reviewed data-loss/replay plan; prefer a forward fix when data has already evolved.

Specific cautions: preserve legacy inclusive opening dates; do not guess missing descriptions; do not convert all old positive imports to salary; do not change dedupe fingerprints without preserving old identities; invalidate/recalculate saved forecasts when the formula version changes.

## 22. Definition of done and release checklist

### Each implementation PR

- [ ] Links phase/task IDs, describes user-visible behavior, and identifies data/contract changes.
- [ ] Includes meaningful tests of the relevant financial invariant or security boundary.
- [ ] Passes appropriate type/lint/build/unit/integration checks.
- [ ] Has owner checks and bounded inputs for new operations.
- [ ] Handles unavailable services, retry/duplicate requests, and conflict states where relevant.
- [ ] Includes migration/backfill/rollback evidence if persisted meaning changes.
- [ ] Updates documentation and removes temporary debugging output.
- [ ] Demonstrates the changed user flow when UI behavior changes.

### Before real-data beta

- [ ] All P0 findings closed with evidence, and required S00–S14 work complete.
- [ ] D01–D32 pass or have a documented justified non-applicability; “not implemented yet” is not a pass.
- [ ] Cross-user, authentication/recovery, import tampering, export, and session-revocation tests pass.
- [ ] Browser flows work at mobile and desktop sizes with keyboard access.
- [ ] Forecast/simulator assumptions, freshness, formula version, and unavailable states are visible.
- [ ] Clean DB migration, legacy migration, backup restore, and deletion/restore procedures are verified.
- [ ] Deployment uses checked artifacts, separated environments, valid secrets, monitoring, and a rollback runbook.
- [ ] Privacy/export/delete behavior matches the published explanation.

### Completion record

For every phase, append: implementation commit/PR, test command/environment, result, demo evidence, migration evidence if applicable, and remaining limitations. Keep planned tasks unchecked until these exist. The plan is fully delivered only after S15 feedback work and all required tasks are completed.

## 23. Traceability to the requested improvements

| Requested improvement | Delivery phase |
|---|---|
| Correct starting/current balances and future dates | S02–S03 |
| Prevent recurring-payment double counting | S07–S08 |
| Enforce RON and correct imports/transfers | S05–S06 |
| Retain merchant descriptions and useful categories | S05–S06 |
| Edit/void transactions, manage rules/accounts | S03, S05, S07 |
| Atomic internal transfers | S05 |
| Honest simulator with complete assumptions | S08–S09, S11 |
| Guided onboarding | S03, S12 |
| Bills calendar and payment status | S07 |
| Variable spending budget and historical suggestions | S09 |
| Spendable amount until payday and protected savings | S03, S08–S09 |
| Reconciliation and data freshness | S10 |
| Purchase dates, saved scenarios, recurring ownership costs | S11 |
| Dashboard hierarchy, import placement, advanced filters | S06, S12 |
| Romanian UI, mobile, accessibility | S12 |
| Unified financial engine and exact monetary contracts | S02, S08 |
| Secure retries, validation, authorization, recovery | S04–S06 |
| Pagination, request deadlines, resilience | S13 |
| Isolated tests, debugging, CI, full browser checks | S00–S01, S15, section 20 |
| Backup/restore, privacy, export/deletion, release readiness | S14 |
| Accurate documentation and product validation | S14–S15 |

First implementation slice: **S00 — isolated tests and deterministic reproductions of F01–F04.** Follow with S01's CI gate and S02's financial contracts before changing stored financial semantics.

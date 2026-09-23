# Saldovio — target data model

Epic 13, Story 5. `improvements.md` §6's entity table, cross-checked against
the live `finance-api/prisma/schema.prisma` and refined by ADRs 0001-0003.
**Not a migration-ready schema** — this documents what's being added
incrementally and which epic owns each addition, not column types, indexes,
or migration order. Each addition still gets its own migration when its
owning epic implements it.

## Existing entities (in `schema.prisma` today)

### User
| Field | Status |
|---|---|
| `id`, `email`, `passwordHash`, `createdAt` | Existing |
| `essentialSpend` | Existing, **renames to `reserve`** — ADR 0003, Epic 19 Story 1 |
| `payday`, `horizonDays` | Existing |
| Business timezone | Planned — Epic 13/`docs/financial-rules.md` §3 requires one explicit timezone; not yet a stored field, currently implicit (`Europe/Bucharest` assumed, nowhere codified) |
| Locale | Planned, low priority — Epic 22 (i18n) is the first story that needs it as a real field rather than the hardcoded `ro-RO` calls already scattered through `web/lib/money.ts` |
| Forecast preference | Planned — no concrete shape yet; deferred until a story actually needs a second forecast mode |
| Onboarding state | Planned — Epic 22 Story 1 (resumable onboarding) |
| Session version | Planned — Epic 15 Story 3 (session revocation on password change/delete/logout-all) |

### Account
| Field | Status |
|---|---|
| `id`, `name`, `currentBalance`, `referenceDate`, `userId` | Existing |
| `openingBoundary` (`legacy_inclusive` \| `start_of_day`) | Planned — ADR 0002, Epic 14 Story 3 |
| `protectedSavings: boolean`, default `false` | Planned — ADR 0003, Epic 14 Story 6 |
| Archived state | Planned — Epic 14 Story 6. Archiving hides an account from routine selection without erasing its money/history from consolidated reporting (S03.6) |
| Purpose | Planned — Epic 14 Story 6, alongside the name-edit already scoped there; no fixed enum decided yet |
| Freshness metadata | Planned — Epic 20 (reconciliation), tracks when the account's balance was last confirmed against an observed real-world value |

### Transaction
| Field | Status |
|---|---|
| `id`, `accountId`, `type`, `amount`, `occurredOn`, `category`, `importHash` | Existing |
| `description` | Planned — Epic 16 Story 1 (F06: Revolut's merchant description is currently dropped at import, structurally unstorable without this column) |
| `lifecycle` (`actual` \| `planned` \| `voided` \| `adjustment`) | Planned — `docs/financial-rules.md` §4, Epic 16 Story 1. Prerequisite for ADR 0002's `start_of_day` balance formula to be fully correct (until it ships, that formula filters on a narrower `voided`-only condition, per ADR 0002's Consequences section) |
| Category reference (FK to `Category`, replacing the freeform `category: String?`) | Planned — Epic 16 Story 9 |
| Source (manual \| import \| recurring-materialization) | Planned — Epic 16 Story 1 |
| Timestamps (`createdAt`/`updatedAt`), `version` | Planned — Epic 16 Story 1, needed once edit/void (Story 2) exists — nothing to version today since transactions are currently immutable after creation |
| Transfer linkage | Planned — see **Transfer** below, Epic 16 Story 1 |
| Occurrence linkage (FK to `Obligation occurrence`) | Planned — see **Payment match** below, Epic 17 Story 4 |

### RecurringRule
| Field | Status |
|---|---|
| `id`, `accountId`, `type`, `amount`, `frequency`, `dayOfMonth`, `category`, `active` | Existing |
| Effective start/end dates, pause/resume/archive, future-change-only edits | Planned — Epic 17 Story 1 ("rule versioning") |
| Weekly/annual frequency (currently monthly-only, `CHECK`-enforced per Sprint 6) | Planned — Epic 17 Story 1 |

## New entities (not in `schema.prisma` yet)

| Entity | Minimum purpose | Owning epic |
|---|---|---|
| Category | User-owned or system-defined classification, stable IDs, replaces freeform `Transaction.category` string | Epic 16 Story 9 |
| Transfer | Atomic source/destination operation, two linked ledger entries — replaces today's convention of a single `Transaction` row with `type: "transfer"` and no linkage to a counterpart row | Epic 16 Story 1/3 |
| Recurring rule version | Effective dates, amount, frequency, account, future-change behavior — the versioning fields listed under RecurringRule above, potentially modeled as a child table rather than columns on `RecurringRule` itself; that shape decision belongs to Epic 17 Story 1's own design, not this doc | Epic 17 Story 1 |
| Obligation occurrence | One dated expected payment/income, status (`planned`/`partial`/`paid`/`overdue`/`postponed`/`skipped` — `docs/financial-rules.md` §4), outstanding amount, rule-version identity | Epic 17 Story 2/3 |
| Payment match | Explicit allocation between a posted `Transaction` and an `Obligation occurrence`, supports partial fulfillment, over-allocation guard | Epic 17 Story 4 |
| Import batch and staged row | User/account-bound preview, expiry, selected rows, parser/fingerprint version, commit result | Epic 16 Story 6 (F18) — **not yet built**: Epic 11 Story 4 deliberately shipped without a server-side batch/session table (the client resends the full preview row set verbatim at commit, re-validated server-side against `@@unique([accountId, importHash])`). `improvements.md`'s own F18 finding names this exact gap (client-trusted hash/amount, no server-owned batch + row IDs) as the reason this entity is needed — the current implementation is the known-gap state, not a design this entity contradicts. |
| Budget | Period, covered categories, available-account scope, planned variable-spend amount — the "variable-spend budget" concept from ADR 0003 §2, distinct from `User.reserve` | Epic 19 Story 2 |
| Reconciliation | Observed balance/date, calculated balance, difference, resolution/adjustment linkage | Epic 20 |
| Scenario | Owner, named inputs, purchase date/account, snapshot metadata, formula version — saved purchase comparisons | Epic 21 Story 5 (post-MVP, per the roadmap's MVP-boundary classification) |
| Idempotency record | Owner, operation, key, normalized payload hash, result and retention | Epic 15 Story 5 |
| Security tokens/audit | Hashed recovery tokens, session revocation support, minimal event records | Epic 24 Story 1 |

## What's deliberately not in this doc

- Column types, nullability, indexes, `CHECK` constraints, and migration
  ordering — each owning epic's own plan decides those when it implements
  the entity, informed by whatever the schema actually needs at that point
  (e.g. ADR 0002 already specifies `openingBoundary` gets no DB default;
  that level of detail lives in the ADR, not duplicated here).
- Any entity or field not already named by `improvements.md` §6 or one of
  the three Epic 13 ADRs — this doc is a checkpoint of already-made
  decisions, not a place to make new ones.

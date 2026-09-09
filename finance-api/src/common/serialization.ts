import type { Prisma } from '../../generated/prisma/client.js';

// Prisma returns NUMERIC columns as Decimal.js instances, not strings.
// CLAUDE.md's "money is never a float" rule has already been enforced
// once at the raw `pg` layer (decimal strings, no parseFloat) and once
// at the Pydantic layer (Decimal always serializes as a JSON string) —
// this is the third layer where the same invariant must be enforced
// explicitly, not assumed from a library default.
export function toDecimalString(value: Prisma.Decimal): string {
  return value.toString();
}

// Postgres DATE columns have no time or timezone component. Reading
// them with local-timezone Date getters previously shifted the
// calendar day by up to a day (fixed once already for the raw `pg`
// driver in database/pool.ts). Use UTC getters here for the same
// reason, regardless of how Prisma represents the value internally.
export function toDateOnlyString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Inverse of toDateOnlyString — anchors a "YYYY-MM-DD" value at UTC
// midnight before writing it to a @db.Date field, so the write side
// can't reintroduce the shift the read side guards against above.
//
// Rejects anything that isn't exactly "YYYY-MM-DD" instead of silently
// producing an Invalid Date. @IsDateString() (used on the DTOs that
// feed this function) is ISO8601, which also accepts full timestamps
// like "2026-09-10T12:00:00Z" — without this guard, that input became
// `new Date("...ZT00:00:00.000Z")` (Invalid Date), which then threw a
// PrismaClientValidationError deep inside the service and surfaced as
// an unhandled 500 instead of a clean 400. The DTOs are additionally
// tightened (see create-transaction.dto.ts / create-account.dto.ts) so
// ValidationPipe catches this before it ever reaches here — this throw
// is the defense-in-depth backstop, not the primary guard.
export function fromDateOnlyString(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`fromDateOnlyString expected a "YYYY-MM-DD" string, got: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

// Today's calendar date where the server is running, anchored at UTC
// midnight for storage — same local-date reasoning already used in
// web/lib/analytics.ts's todayDateString, ported to this layer.
export function todayDateOnly(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return fromDateOnlyString(`${year}-${month}-${day}`);
}

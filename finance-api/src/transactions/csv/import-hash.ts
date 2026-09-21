import { createHash } from 'node:crypto';

// Dedupe fingerprint per brief §11 rule 3 ("repeated import of the same
// file must be handled explicitly; never invent bank identifiers not
// present in the file"). All five inputs are taken verbatim from the CSV
// row's raw string values — not the normalized/derived amount or date —
// so re-importing the exact same file always reproduces the exact same
// hash. This is an internal dedupe fingerprint only, never presented to
// the user as or confused with a real Revolut transaction ID.
//
// `discriminator` is set to "fee" when hashing the fee half of a row that
// got split into two transactions (see revolut-parser.ts) — without it, a
// row whose Fee happens to equal its Amount would hash identically to its
// own main row and collide.
export function computeImportHash(fields: {
  completedDate: string;
  description: string;
  amount: string;
  currency: string;
  balance: string;
  discriminator?: 'fee';
}): string {
  const parts = [
    fields.completedDate,
    fields.description,
    fields.amount,
    fields.currency,
    fields.balance,
  ];
  if (fields.discriminator) {
    parts.push(fields.discriminator);
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

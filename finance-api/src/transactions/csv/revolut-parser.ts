import { parse } from 'csv-parse/sync';
import { computeImportHash } from './import-hash.js';

export type ParsedRowStatus = 'valid' | 'duplicate' | 'error' | 'skipped';

export type ParsedRow = {
  hash: string;
  status: ParsedRowStatus;
  description: string;
  occurredOn: string | null;
  type: 'income' | 'expense' | null;
  amount: string | null;
  category: string | null;
  reason: string | null;
};

// Defensive ceiling, not a product constant — guards against a runaway
// upload (memory, request-timeout) rather than expressing any real
// business limit on statement size.
const MAX_DATA_ROWS = 5000;

type RawRevolutRow = {
  Type: string;
  Product: string;
  'Started Date': string;
  'Completed Date': string;
  Description: string;
  Amount: string;
  Fee: string;
  Currency: string;
  State: string;
  Balance: string;
};

export function parseRevolutCsv(input: Buffer | string): ParsedRow[] {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as RawRevolutRow[];

  if (records.length > MAX_DATA_ROWS) {
    throw new Error(`CSV has ${records.length} rows, exceeding the ${MAX_DATA_ROWS}-row limit`);
  }

  return records.flatMap(parseRecord);
}

function parseRecord(record: RawRevolutRow): ParsedRow[] {
  const description = record.Description ?? '';
  const hashFields = (amount: string, discriminator?: 'fee') => ({
    completedDate: record['Completed Date'],
    description,
    amount,
    currency: record.Currency,
    balance: record.Balance,
    discriminator,
  });

  // Only a COMPLETED row is ever a candidate for import — everything
  // else is reported, never silently dropped and never imported.
  if (record.State !== 'COMPLETED') {
    return [
      {
        hash: computeImportHash(hashFields(record.Amount)),
        status: 'skipped',
        description,
        occurredOn: null,
        type: null,
        amount: null,
        category: null,
        reason: `State is "${record.State}", not COMPLETED`,
      },
    ];
  }

  const occurredOn = parseCompletedDate(record['Completed Date']);
  const amount = parseDecimalField(record.Amount);

  if (occurredOn === null || amount === null) {
    const reasons: string[] = [];
    if (occurredOn === null) reasons.push(`unparseable Completed Date "${record['Completed Date']}"`);
    if (amount === null) reasons.push(`unparseable Amount "${record.Amount}"`);
    return [
      {
        hash: computeImportHash(hashFields(record.Amount)),
        status: 'error',
        description,
        occurredOn: null,
        type: null,
        amount: null,
        category: null,
        reason: reasons.join('; '),
      },
    ];
  }

  const mainRow: ParsedRow = {
    hash: computeImportHash(hashFields(record.Amount)),
    status: 'valid',
    description,
    occurredOn,
    type: amount.startsWith('-') ? 'expense' : 'income',
    amount,
    category: record.Type,
    reason: null,
  };

  const rows: ParsedRow[] = [mainRow];

  // A nonzero Fee is a real cost distinct from the row's own Amount
  // (e.g. a currency-exchange or ATM fee) — imported as its own expense
  // row, same date, category "Fee", with its own independent dedupe
  // hash (see the "discriminator" comment on computeImportHash).
  const fee = parseDecimalField(record.Fee);
  if (fee !== null && Number(fee) !== 0) {
    rows.push({
      hash: computeImportHash(hashFields(record.Fee, 'fee')),
      status: 'valid',
      description,
      occurredOn,
      type: 'expense',
      amount: fee.startsWith('-') ? fee : `-${fee}`,
      category: 'Fee',
      reason: null,
    });
  }

  return rows;
}

// "2026-09-10 14:32:00" -> "2026-09-10", or null if the string doesn't
// match the expected shape or names a calendar date that doesn't exist.
function parseCompletedDate(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}:\d{2}/.exec(value.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth) return null;
  return `${yearStr}-${monthStr}-${dayStr}`;
}

// Returns the trimmed decimal string unchanged (so the dedupe hash can
// still use the file-verbatim value upstream), or null if it isn't a
// plain optionally-negative decimal. An empty/blank field (common for
// Fee) returns null, read by the caller as "no fee".
function parseDecimalField(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}

import { describe, expect, it } from 'vitest';
import { csvEscape } from './csv-escape.js';

describe('csvEscape', () => {
  it('returns a plain value unchanged', () => {
    expect(csvEscape('Groceries')).toBe('Groceries');
  });

  it('quotes and escapes a value containing a comma', () => {
    expect(csvEscape('Rent, September')).toBe('"Rent, September"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes a value containing a bare carriage return (no following newline)', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"');
  });

  it('leaves an empty string unchanged', () => {
    expect(csvEscape('')).toBe('');
  });

  // improvements.md F16 (P0): csvEscape only quotes on RFC 4180 trigger
  // characters (" , \r \n) — it has no defense against spreadsheet formula
  // injection, where a value starting with =, +, -, or @ is interpreted by
  // Excel/Sheets/LibreOffice as a formula when the exported CSV is opened.
  // csvEscape is applied to category and account-name (transactions.
  // service.ts's exportCsv), both freeform user-controlled text (a
  // category can arrive verbatim from an imported CSV's Type column —
  // see F06/revolut-parser.ts — or from manual entry).
  //
  // EXPECTED (once F16 is fixed): a formula-shaped value is neutralized
  // (e.g. prefixed so a spreadsheet reads it as text, not a formula).
  // CURRENT (proves the finding): it passes through byte-identical.
  it('F16: does not neutralize a leading-= formula-injection payload', () => {
    const payload = "=cmd|'/c calc'!A1";
    expect(csvEscape(payload)).not.toBe(payload);
  });
});

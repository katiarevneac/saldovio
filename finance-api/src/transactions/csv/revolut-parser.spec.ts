import { describe, expect, it } from 'vitest';
import { parseRevolutCsv } from './revolut-parser.js';

const HEADER = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseRevolutCsv', () => {
  it('parses a valid COMPLETED expense row', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'valid',
      description: 'Coffee Shop',
      occurredOn: '2026-09-10',
      type: 'expense',
      amount: '-12.50',
      category: 'CARD_PAYMENT',
      reason: null,
    });
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses a valid COMPLETED income row (positive amount)', () => {
    const rows = parseRevolutCsv(
      csv('TOPUP,Current,2026-09-11 09:00:00,2026-09-11 09:00:00,Top-up,100.00,0,RON,COMPLETED,1087.50'),
    );

    expect(rows[0]).toMatchObject({ status: 'valid', type: 'income', amount: '100.00' });
  });

  it('skips a non-COMPLETED row with a reason, instead of importing or erroring it', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,PENDING,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('skipped');
    expect(rows[0].reason).toContain('PENDING');
  });

  it('produces an error row (not a thrown exception) for an unparseable Completed Date', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,not-a-date,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].reason).toContain('Completed Date');
    expect(rows[0].occurredOn).toBeNull();
  });

  it('produces an error row for a non-numeric Amount', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,not-a-number,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].reason).toContain('Amount');
  });

  it('expands a row with a nonzero Fee into a main row plus a separate Fee row', () => {
    const rows = parseRevolutCsv(
      csv('EXCHANGE,Current,2026-09-12 08:00:00,2026-09-12 08:00:00,FX trade,-50.00,1.25,RON,COMPLETED,937.25'),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: 'valid', type: 'expense', amount: '-50.00', category: 'EXCHANGE' });
    expect(rows[1]).toMatchObject({ status: 'valid', type: 'expense', amount: '-1.25', category: 'Fee' });
    expect(rows[1].occurredOn).toBe(rows[0].occurredOn);
    expect(rows[1].hash).not.toBe(rows[0].hash);
  });

  it('does not add a Fee row when Fee is 0 or blank', () => {
    const zero = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );
    const blank = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,,RON,COMPLETED,987.50'),
    );

    expect(zero).toHaveLength(1);
    expect(blank).toHaveLength(1);
  });

  it('does not add a Fee row for a zero fee formatted as "0.00", "0.0", or "-0.00" (real Revolut exports always format to 2 decimals)', () => {
    for (const feeValue of ['0.00', '0.0', '-0.00']) {
      const rows = parseRevolutCsv(
        csv(
          `CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Coffee Shop,-12.50,${feeValue},RON,COMPLETED,987.50`,
        ),
      );
      expect(rows, `Fee="${feeValue}" should not produce a Fee row`).toHaveLength(1);
    }
  });

  it('produces an error row, not a silently-rolled-over date, for a calendar-invalid Completed Date', () => {
    const rows = parseRevolutCsv(
      csv('CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-02-30 10:00:00,Coffee Shop,-12.50,0,RON,COMPLETED,987.50'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].occurredOn).toBeNull();
    expect(rows[0].reason).toContain('Completed Date');
  });

  it('gives the main row and the fee row different hashes end-to-end even when Fee equals Amount exactly', () => {
    const rows = parseRevolutCsv(
      csv('EXCHANGE,Current,2026-09-12 08:00:00,2026-09-12 08:00:00,FX trade,-1.00,1.00,RON,COMPLETED,937.25'),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].hash).not.toBe(rows[1].hash);
  });

  it('rejects a structurally broken CSV (inconsistent column count) by throwing', () => {
    expect(() => parseRevolutCsv('Type,Product\nonly,two,but,header,has,two')).toThrow();
  });

  it('rejects a file over the row cap by throwing', () => {
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `CARD_PAYMENT,Current,2026-09-10 10:00:00,2026-09-10 10:00:00,Row ${i},-1.00,0,RON,COMPLETED,1.00`,
    );

    expect(() => parseRevolutCsv(csv(...rows))).toThrow(/row limit/);
  });
});

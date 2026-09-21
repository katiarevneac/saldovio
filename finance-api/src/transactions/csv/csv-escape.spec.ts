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

  it('leaves an empty string unchanged', () => {
    expect(csvEscape('')).toBe('');
  });
});

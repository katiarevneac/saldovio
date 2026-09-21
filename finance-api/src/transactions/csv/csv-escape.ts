// RFC 4180-style escaping: a field containing a comma, quote, or
// newline gets wrapped in double quotes, with any embedded double
// quote itself doubled. Used by exportCsv for the `category` and
// account-name fields, since a user-entered category is freeform text
// that can legally contain a comma.
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

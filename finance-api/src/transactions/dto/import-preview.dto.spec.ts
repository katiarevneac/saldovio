import { describe, expect, it } from 'vitest';
import { ImportPreviewSchema } from './import-preview.dto.js';

describe('ImportPreviewSchema', () => {
  it('coerces a string accountId (as sent by a multipart form field) to a number', () => {
    const result = ImportPreviewSchema.safeParse({ accountId: '5' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.accountId).toBe(5);
  });

  it('rejects a non-numeric accountId', () => {
    expect(ImportPreviewSchema.safeParse({ accountId: 'not-a-number' }).success).toBe(false);
  });

  it('rejects a missing accountId', () => {
    expect(ImportPreviewSchema.safeParse({}).success).toBe(false);
  });
});

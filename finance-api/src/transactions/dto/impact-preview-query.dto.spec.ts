import { describe, expect, it } from 'vitest';
import { ImpactPreviewQuerySchema } from './impact-preview-query.dto.js';

describe('ImpactPreviewQuerySchema', () => {
  it('coerces amount from the query string', () => {
    const r = ImpactPreviewQuerySchema.parse({ action: 'edit', amount: '-12.5' });
    expect(r.amount).toBe(-12.5);
  });
  it('rejects an unknown action', () => {
    expect(ImpactPreviewQuerySchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
  it('rejects a calendar-invalid occurredOn', () => {
    expect(ImpactPreviewQuerySchema.safeParse({ action: 'edit', occurredOn: '2026-13-45' }).success).toBe(false);
    expect(ImpactPreviewQuerySchema.safeParse({ action: 'edit', occurredOn: '2026-02-30' }).success).toBe(false);
  });
  it('accepts a valid date and void without extras', () => {
    expect(ImpactPreviewQuerySchema.safeParse({ action: 'edit', occurredOn: '2026-02-28' }).success).toBe(true);
    expect(ImpactPreviewQuerySchema.safeParse({ action: 'void' }).success).toBe(true);
  });
});

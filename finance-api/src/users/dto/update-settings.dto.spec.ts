import { describe, expect, it } from 'vitest';
import { UpdateSettingsSchema } from './update-settings.dto.js';

describe('UpdateSettingsSchema', () => {
  it('accepts an empty object (PATCH — every field optional)', () => {
    expect(UpdateSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a full valid payload', () => {
    const valid = { essentialSpend: 1500, payday: 15, horizonDays: 45 };
    expect(UpdateSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts explicit null for essentialSpend and payday (clearing them)', () => {
    expect(UpdateSettingsSchema.safeParse({ essentialSpend: null }).success).toBe(true);
    expect(UpdateSettingsSchema.safeParse({ payday: null }).success).toBe(true);
  });

  it('rejects a negative essentialSpend', () => {
    expect(UpdateSettingsSchema.safeParse({ essentialSpend: -1 }).success).toBe(false);
  });

  it('rejects payday outside 1-31', () => {
    expect(UpdateSettingsSchema.safeParse({ payday: 0 }).success).toBe(false);
    expect(UpdateSettingsSchema.safeParse({ payday: 32 }).success).toBe(false);
  });

  it('rejects a zero or negative horizonDays (no null — it always has a default)', () => {
    expect(UpdateSettingsSchema.safeParse({ horizonDays: 0 }).success).toBe(false);
    expect(UpdateSettingsSchema.safeParse({ horizonDays: -5 }).success).toBe(false);
    expect(UpdateSettingsSchema.safeParse({ horizonDays: null }).success).toBe(false);
  });
});

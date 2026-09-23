import { describe, expect, it } from 'vitest';
import { ClockService } from './clock.service.js';

describe('ClockService', () => {
  it('now() returns the real current time by default', () => {
    const clock = new ClockService();
    const before = Date.now();
    const observed = clock.now().getTime();
    const after = Date.now();

    expect(observed).toBeGreaterThanOrEqual(before);
    expect(observed).toBeLessThanOrEqual(after);
  });

  it('today() returns a UTC-midnight-anchored Date for the current local calendar day', () => {
    const clock = new ClockService();
    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = now.getMonth();
    const expectedDay = now.getDate();

    const today = clock.today();

    expect(today.getUTCFullYear()).toBe(expectedYear);
    expect(today.getUTCMonth()).toBe(expectedMonth);
    expect(today.getUTCDate()).toBe(expectedDay);
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
  });
});

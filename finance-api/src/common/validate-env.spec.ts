import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate-env.js';

describe('validateEnv (finance-api)', () => {
  const REQUIRED = ['DATABASE_URL', 'INTERNAL_API_SECRET'];

  it('does not throw when every required key is a non-empty string', () => {
    const env = { DATABASE_URL: 'postgresql://x', INTERNAL_API_SECRET: 'a-secret' };
    expect(() => validateEnv(env, REQUIRED)).not.toThrow();
  });

  it('throws listing every missing key, and never includes a value', () => {
    const env = { DATABASE_URL: 'postgresql://x', INTERNAL_API_SECRET: '' };
    expect(() => validateEnv(env, REQUIRED)).toThrow(/INTERNAL_API_SECRET/);
  });

  it('throws when a required key is entirely absent', () => {
    const env = { DATABASE_URL: 'postgresql://x' };
    expect(() => validateEnv(env, REQUIRED)).toThrow(/INTERNAL_API_SECRET/);
  });

  it('lists all missing keys in one error, not just the first', () => {
    const env = {};
    expect(() => validateEnv(env, REQUIRED)).toThrow(/DATABASE_URL.*INTERNAL_API_SECRET|INTERNAL_API_SECRET.*DATABASE_URL/s);
  });
});

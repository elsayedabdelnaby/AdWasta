import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadConfig } from './env.js';

const validKek = randomBytes(32).toString('base64');

const base = {
  DATABASE_URL: 'postgresql://app_user:app_user@localhost:5432/marketing_agent',
  CREDENTIALS_MASTER_KEY: validKek,
};

describe('loadConfig', () => {
  it('parses a minimal valid environment and applies defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(cfg.PORT).toBe(3001);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.DAILY_BUDGET_USD).toBe(10);
    expect(cfg.MONTHLY_BUDGET_USD).toBe(50);
    expect(cfg.MAX_RUN_COST_USD).toBe(2);
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...noDb } = base;
    expect(() => loadConfig(noDb)).toThrow();
  });

  it('rejects a CREDENTIALS_MASTER_KEY that is not 32 decoded bytes', () => {
    expect(() => loadConfig({ ...base, CREDENTIALS_MASTER_KEY: 'too-short' })).toThrow(
      /32/,
    );
  });

  it('accepts a 32-byte base64 KEK', () => {
    expect(() => loadConfig({ ...base, CREDENTIALS_MASTER_KEY: validKek })).not.toThrow();
  });

  it('defaults AUTH_PROVIDER to workos when a WorkOS API key is present', () => {
    const cfg = loadConfig({ ...base, WORKOS_API_KEY: 'sk_test_123' });
    expect(cfg.AUTH_PROVIDER).toBe('workos');
  });

  it('defaults AUTH_PROVIDER to dev when no WorkOS API key is present', () => {
    const cfg = loadConfig(base);
    expect(cfg.AUTH_PROVIDER).toBe('dev');
  });

  it('honors an explicit AUTH_PROVIDER override', () => {
    const cfg = loadConfig({ ...base, AUTH_PROVIDER: 'dev', WORKOS_API_KEY: 'sk_test_123' });
    expect(cfg.AUTH_PROVIDER).toBe('dev');
  });

  it('coerces numeric budget caps from strings', () => {
    const cfg = loadConfig({ ...base, DAILY_BUDGET_USD: '25', MAX_RUN_COST_USD: '3.5' });
    expect(cfg.DAILY_BUDGET_USD).toBe(25);
    expect(cfg.MAX_RUN_COST_USD).toBe(3.5);
  });
});

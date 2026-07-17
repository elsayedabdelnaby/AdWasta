import { defineConfig } from 'vitest/config';
import { randomBytes } from 'node:crypto';
import { TEST_DATABASE_URL, TEST_ADMIN_URL, TEST_REDIS_URL } from './tests/db-config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // DB/Redis integration tests share state — run files serially to avoid races.
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      AUTH_PROVIDER: 'dev',
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_ADMIN_URL: TEST_ADMIN_URL,
      REDIS_URL: TEST_REDIS_URL,
      // Throwaway per-run KEK — tests exercise envelope crypto round-trips only.
      CREDENTIALS_MASTER_KEY: randomBytes(32).toString('base64'),
    },
  },
});

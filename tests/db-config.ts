// Shared test-database coordinates. Imported by vitest.config.ts (to inject
// process.env for workers) and by the global setup (to run migrations once).
// The APP role is the non-superuser `app_user` so RLS is genuinely enforced in
// tests; migrations run as the DB owner.
const owner = process.env.PGUSER || process.env.USER || 'postgres';
// Overridable so the suite can run inside a container against the compose
// network (TEST_DB_HOST=db); defaults to the native-localhost workflow.
const host = process.env.TEST_DB_HOST || 'localhost';

export const TEST_DB_NAME = 'marketing_agent_test';
export const TEST_DATABASE_URL = `postgresql://app_user:app_user@${host}:5432/${TEST_DB_NAME}`;
export const TEST_ADMIN_URL = `postgresql://${owner}@${host}:5432/${TEST_DB_NAME}`;
export const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

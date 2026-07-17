import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { TEST_ADMIN_URL } from './db-config';

const MIGRATIONS_DIR = 'src/db/migrations';
const JOURNAL = `${MIGRATIONS_DIR}/meta/_journal.json`;

/**
 * Runs once before the whole test suite. Applies migrations to the test DB as
 * the owner, then grants the non-superuser app_user CRUD on the resulting
 * objects (so the app role can work while RLS still governs which rows it sees).
 * No-ops gracefully before any migration exists so pure-unit tests can run.
 */
export default async function setup(): Promise<void> {
  const admin = new Pool({ connectionString: TEST_ADMIN_URL });
  try {
    await admin.query('select 1');
  } catch (err) {
    await admin.end();
    throw new Error(
      `Cannot reach test database at ${TEST_ADMIN_URL}. Is Postgres running and marketing_agent_test created? ${String(err)}`,
    );
  }

  if (existsSync(JOURNAL)) {
    // Grants + the audit_log immutability revoke live in the RLS migration itself,
    // so the app role's privileges are applied here as a side effect of migrating.
    const db = drizzle(admin);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  }

  await admin.end();
}

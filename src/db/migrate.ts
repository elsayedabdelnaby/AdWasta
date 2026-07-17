import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const { Pool } = pg;

// Migrations run as the OWNER (DATABASE_ADMIN_URL): creating tables, RLS policies,
// and grants requires ownership. The app never uses this connection.
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_ADMIN_URL (or DATABASE_URL) must be set to run migrations');
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  // eslint-disable-next-line no-console
  console.log('migrations applied');
} finally {
  await pool.end();
}

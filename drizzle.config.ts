import { defineConfig } from 'drizzle-kit';

// Migrations run as the OWNER/superuser (DATABASE_ADMIN_URL), not the app role —
// creating tables, RLS policies, and grants requires ownership. The app itself
// connects through the non-superuser app_user role (DATABASE_URL) so RLS bites.
const url =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/marketing_agent';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});

-- eval_runs is a SYSTEM/CI table (no tenant data) — intentionally not RLS-scoped,
-- like the migrations bookkeeping table. Grant the app role CRUD so the eval CLI
-- can record results.
GRANT SELECT, INSERT, UPDATE, DELETE ON "eval_runs" TO app_user;

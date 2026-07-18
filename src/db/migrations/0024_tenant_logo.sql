-- Tenant logo stored inline on the RLS-protected profile row (small images,
-- 2MB route cap — no external object store needed at this scale). Columns on
-- an existing table: tenant_isolation policy and app_user grants already apply.
ALTER TABLE "tenant_profiles" ADD COLUMN "logo" bytea;--> statement-breakpoint
ALTER TABLE "tenant_profiles" ADD COLUMN "logo_mime" text;

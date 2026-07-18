-- Business links on the tenant profile: own website + public social page urls
-- (facebook/instagram/...). Feeds the RESEARCH context so intel is specific to
-- the tenant's actual presence. Columns on an existing RLS-protected table —
-- the tenant_isolation policy and app_user grants already cover them.
ALTER TABLE "tenant_profiles" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "tenant_profiles" ADD COLUMN "social_urls" jsonb NOT NULL DEFAULT '{}'::jsonb;

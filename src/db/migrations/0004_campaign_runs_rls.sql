-- RLS + app_user grant for campaign_runs (same policy shape as 0001).
ALTER TABLE "campaign_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "campaign_runs" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "campaign_runs" TO app_user;

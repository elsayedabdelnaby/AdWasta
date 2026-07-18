-- RLS + app_user grant for engagement_items (same policy shape as 0001).
ALTER TABLE "engagement_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagement_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "engagement_items" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "engagement_items" TO app_user;

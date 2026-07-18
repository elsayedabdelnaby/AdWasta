-- RLS + app_user grants for the MEASURE tables (same policy shape as 0001).
ALTER TABLE "post_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_metrics" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "post_metrics" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "performance_insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "performance_insights" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "performance_insights" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "post_metrics" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "performance_insights" TO app_user;

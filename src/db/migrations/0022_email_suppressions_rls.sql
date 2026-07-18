-- RLS + app_user grant for email_suppressions (same policy shape as 0001).
ALTER TABLE "email_suppressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_suppressions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_suppressions" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_suppressions" TO app_user;

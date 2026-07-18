CREATE TABLE "daily_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brief_date" date NOT NULL,
	"summary" text NOT NULL,
	"email_priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"social_priorities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"performance_highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counter_campaign_cta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_briefs_tenant_created_idx" ON "daily_briefs" USING btree ("tenant_id","created_at" DESC NULLS LAST);
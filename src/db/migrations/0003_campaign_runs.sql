CREATE TABLE "campaign_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idea" text,
	"status" text DEFAULT 'running' NOT NULL,
	"current_step" text DEFAULT 'research' NOT NULL,
	"step_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suspend_data" jsonb,
	"resume_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_runs_tenant_created_idx" ON "campaign_runs" USING btree ("tenant_id","created_at" DESC NULLS LAST);
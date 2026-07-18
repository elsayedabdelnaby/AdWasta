CREATE TABLE "engagement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"platform" text NOT NULL,
	"thread_id" text,
	"inbound_text" text NOT NULL,
	"draft_reply" text,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"privacy_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_items_tenant_created_idx" ON "engagement_items" USING btree ("tenant_id","created_at" DESC NULLS LAST);
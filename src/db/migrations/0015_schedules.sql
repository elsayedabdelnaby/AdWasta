CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"draft_id" uuid,
	"type" text NOT NULL,
	"platform" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"reminder_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"armed" boolean DEFAULT false NOT NULL,
	"last_step" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_tenant_scheduled_idx" ON "schedules" USING btree ("tenant_id","scheduled_at");
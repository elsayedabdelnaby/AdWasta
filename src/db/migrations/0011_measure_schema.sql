CREATE TABLE "post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"published_item_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"impressions" integer,
	"reach" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"clicks" integer,
	"saves" integer,
	"video_views" integer,
	"opens" integer,
	"bounces" integer,
	"unsubscribes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"cited_metric_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provisional" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_insights" ADD CONSTRAINT "performance_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_metrics_tenant_item_idx" ON "post_metrics" USING btree ("tenant_id","published_item_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_insights_tenant_created_idx" ON "performance_insights" USING btree ("tenant_id","created_at" DESC NULLS LAST);
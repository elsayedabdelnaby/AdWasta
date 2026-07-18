CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pillar" text NOT NULL,
	"passed" integer NOT NULL,
	"total" integer NOT NULL,
	"pass_rate" numeric(5, 4) NOT NULL,
	"fixtures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_runs_pillar_created_idx" ON "eval_runs" USING btree ("pillar","created_at" DESC NULLS LAST);
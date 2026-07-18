ALTER TABLE "jobs" ADD COLUMN "short_term" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "working_memory" jsonb DEFAULT '{}'::jsonb NOT NULL;
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Durable state for the supervised campaign pipeline (Task 0.5.6). The pipeline
// suspends before OPS awaiting human approval; because state lives here (tenant-
// scoped, RLS), a resume works after a process restart. Replaces Mastra's
// storage — see ADR note: hand-rolled to keep every table under our RLS.
export const campaignRuns = pgTable(
  'campaign_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    idea: text('idea'),
    // running | suspended | completed | bailed | failed
    status: text('status').notNull().default('running'),
    // research | strategy | creation | awaiting_approval | ops | done
    currentStep: text('current_step').notNull().default('research'),
    stepResults: jsonb('step_results').$type<Record<string, unknown>>().notNull().default({}),
    suspendData: jsonb('suspend_data').$type<Record<string, unknown> | null>(),
    resumeData: jsonb('resume_data').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaign_runs_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

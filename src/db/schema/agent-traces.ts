import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export interface TraceStep {
  action: string;
  tool?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  promptVersion?: string;
  error?: string;
}

// Per-run LLM/tool observability (design §7.1, §18). id IS the trace_id.
export const agentTraces = pgTable(
  'agent_traces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    arm: text('arm'),
    crew: text('crew'),
    jobId: uuid('job_id'),
    campaignId: uuid('campaign_id'),
    steps: jsonb('steps').$type<TraceStep[]>().notNull().default([]),
    status: text('status').notNull().default('running'), // running | completed | failed
    totalCostUsd: numeric('total_cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    totalLatencyMs: integer('total_latency_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_traces_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

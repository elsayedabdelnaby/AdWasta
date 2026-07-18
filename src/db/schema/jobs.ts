import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Async arm/campaign job state (design §18). The worker sets app.tenant_id from
// this row's tenant_id at run time — never from job input (ADR-002).
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    arm: text('arm').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'), // queued | running | completed | failed
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    error: text('error'),
    // Memory (design §5): short-term = the arm's turn buffer; working = job-scoped scratch.
    shortTerm: jsonb('short_term').$type<unknown[]>().notNull().default([]),
    workingMemory: jsonb('working_memory').$type<Record<string, unknown>>().notNull().default({}),
    traceId: uuid('trace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('jobs_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

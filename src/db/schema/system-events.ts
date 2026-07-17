import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// The full activity stream (design §7.1). Every significant action writes a row.
// payload carries structured metadata — NEVER secrets or full prompt dumps.
export const systemEvents = pgTable(
  'system_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(), // user | system | crew | adapter
    actorId: text('actor_id'),
    category: text('category').notNull(), // tenant | toggle | credential | campaign | job | approval | ops | guardrail | budget | eval
    action: text('action').notNull(), // e.g. draft.approved, campaign.started
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    jobId: uuid('job_id'),
    traceId: uuid('trace_id'),
    campaignId: uuid('campaign_id'),
    severity: text('severity').notNull().default('info'), // info | warning | error | critical
    message: text('message').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
  },
  (t) => [
    index('system_events_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('system_events_tenant_category_created_idx').on(
      t.tenantId,
      t.category,
      t.createdAt.desc(),
    ),
    index('system_events_campaign_idx').on(t.campaignId),
    index('system_events_job_idx').on(t.jobId),
    index('system_events_trace_idx').on(t.traceId),
  ],
);

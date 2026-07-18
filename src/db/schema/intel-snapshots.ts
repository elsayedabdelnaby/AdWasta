import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// RESEARCH output (design §12). One row per arm run. citations[] is REQUIRED —
// snapshots without citations fail the eval gate and are hidden from Content.
export const intelSnapshots = pgTable(
  'intel_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // market | trend | competitor
    competitorId: uuid('competitor_id'),
    summary: text('summary').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('intel_snapshots_tenant_type_created_idx').on(t.tenantId, t.type, t.createdAt.desc())],
);

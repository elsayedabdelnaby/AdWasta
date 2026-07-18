import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Tier-0 watch state (ADR-003). Per source: conditional-GET validators (etag /
// last-modified) + the last content fingerprint, so hourly polling stays free and
// only a real change escalates to the Tier-1 LLM arm.
export const intelWatermarks = pgTable(
  'intel_watermarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // trend | competitor
    source: text('source').notNull(), // feed url or 'brave:<query>'
    etag: text('etag'),
    lastModified: text('last_modified'),
    fingerprint: text('fingerprint'), // 64-bit SimHash as 16-hex chars
    seenCount: integer('seen_count').notNull().default(1),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastAnalyzedAt: timestamp('last_analyzed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('intel_watermarks_tenant_kind_source_key').on(t.tenantId, t.kind, t.source)],
);

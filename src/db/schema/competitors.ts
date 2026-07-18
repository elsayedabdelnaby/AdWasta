import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const competitors = pgTable(
  'competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform'),
    url: text('url'),
    watchEnabled: boolean('watch_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('competitors_tenant_idx').on(t.tenantId)],
);

// Detected rival campaigns (design §12.1). status open|dismissed.
export const competitorAlerts = pgTable(
  'competitor_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('open'), // open | dismissed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('competitor_alerts_tenant_status_created_idx').on(t.tenantId, t.status, t.createdAt.desc())],
);

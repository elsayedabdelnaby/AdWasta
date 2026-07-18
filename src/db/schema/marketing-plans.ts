import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Versioned marketing plan (design §7.2). KPIs use the §12.2 taxonomy classes
// (awareness | engagement | traffic | conversion | email).
export const marketingPlans = pgTable(
  'marketing_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    horizonDays: integer('horizon_days').notNull().default(90),
    channels: jsonb('channels').$type<string[]>().notNull().default([]),
    themes: jsonb('themes').$type<string[]>().notNull().default([]),
    kpis: jsonb('kpis').$type<{ name: string; class: string }[]>().notNull().default([]),
    calendarSkeleton: jsonb('calendar_skeleton').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('active'), // active | archived
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('marketing_plans_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

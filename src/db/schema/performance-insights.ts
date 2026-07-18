import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Analyst output (design §12.2). Every claim cites post_metrics row ids. Groups
// below the min sample are `provisional` and excluded from downstream prompts.
export const performanceInsights = pgTable(
  'performance_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // winning_angle | losing_angle | hook | format | timing
    summary: text('summary').notNull(),
    citedMetricIds: jsonb('cited_metric_ids').$type<string[]>().notNull().default([]),
    provisional: boolean('provisional').notNull().default(false),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('performance_insights_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

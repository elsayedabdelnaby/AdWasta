import { pgTable, uuid, text, timestamp, jsonb, date, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Daily strategist output per tenant per day (design §13). References real tenant
// state only — platforms/competitors are constrained to the profile.
export const dailyBriefs = pgTable(
  'daily_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    briefDate: date('brief_date').notNull(),
    summary: text('summary').notNull(),
    emailPriorities: jsonb('email_priorities').$type<string[]>().notNull().default([]),
    socialPriorities: jsonb('social_priorities').$type<{ platform: string; priority: string }[]>().notNull().default([]),
    performanceHighlights: jsonb('performance_highlights').$type<string[]>().notNull().default([]),
    openAlerts: jsonb('open_alerts').$type<Record<string, unknown>[]>().notNull().default([]),
    counterCampaignCta: text('counter_campaign_cta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('daily_briefs_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Ideal Customer Profile (design §7.2). audience_model branches strategy prompts:
// b2b = firmographics/triggers/objections; b2c = demographics/psychographics/occasions.
export const icpProfiles = pgTable(
  'icp_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    audienceModel: text('audience_model').notNull().default('b2c'), // b2b | b2c
    segments: jsonb('segments').$type<string[]>().notNull().default([]),
    triggers: jsonb('triggers').$type<string[]>().notNull().default([]),
    objections: jsonb('objections').$type<string[]>().notNull().default([]),
    summary: text('summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('icp_profiles_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

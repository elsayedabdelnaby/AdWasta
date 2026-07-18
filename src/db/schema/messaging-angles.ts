import { pgTable, uuid, text, timestamp, integer, jsonb, numeric, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Positioning angles + hooks + proof points per channel (design §7.2).
// performance_score is populated later by the Analyst arm (Phase 3.5).
export const messagingAngles = pgTable(
  'messaging_angles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id'),
    channel: text('channel').notNull(), // social | email
    angle: text('angle').notNull(),
    hooks: jsonb('hooks').$type<string[]>().notNull().default([]),
    proofPoints: jsonb('proof_points').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    performanceScore: numeric('performance_score', { precision: 6, scale: 3 }),
    status: text('status').notNull().default('active'), // active | retired
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messaging_angles_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

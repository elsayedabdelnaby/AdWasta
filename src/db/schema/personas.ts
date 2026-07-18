import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Buyer personas derived from the ICP (design §7.2). 2–4 per tenant.
export const personas = pgTable(
  'personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    icpId: uuid('icp_id'),
    name: text('name').notNull(),
    description: text('description').notNull(),
    pains: jsonb('pains').$type<string[]>().notNull().default([]),
    goals: jsonb('goals').$type<string[]>().notNull().default([]),
    channels: jsonb('channels').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('personas_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

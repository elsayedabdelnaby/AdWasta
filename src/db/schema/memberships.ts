import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// The authorization record (ADR-002): a WorkOS user's membership in a tenant.
// Session identity → membership → tenant. `user_id` is the WorkOS user id.
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('owner'), // owner | admin | member
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_tenant_user_key').on(t.tenantId, t.userId),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

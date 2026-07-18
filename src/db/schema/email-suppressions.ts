import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Per-tenant suppression list (design §21). The Publisher REFUSES to send to any
// address here — a harness gate like risk levels. Survives list re-import.
export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    reason: text('reason').notNull(), // unsubscribe | hard_bounce | complaint
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('email_suppressions_tenant_email_key').on(t.tenantId, t.email)],
);

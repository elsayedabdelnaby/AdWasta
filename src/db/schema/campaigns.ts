import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// A tenant's campaigns (design §12.1). kind=counter links to the competitor alert
// it responds to.
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('proactive'), // proactive | counter
    responseToAlertId: uuid('response_to_alert_id'),
    goal: text('goal'),
    status: text('status').notNull().default('active'), // active | completed | archived
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

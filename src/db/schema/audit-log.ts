import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Append-only compliance subset (design §7.1). Every audit row shares its
// event_id with a system_events row. Immutable: app_user is granted only
// SELECT + INSERT (UPDATE/DELETE revoked in the RLS migration).
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull(), // same id as the paired system_events row
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    category: text('category').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    message: text('message').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
  },
  (t) => [index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

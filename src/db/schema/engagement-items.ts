import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Inbound social threads (design §10.1). type comment|message(DM). DMs are
// privacy-sensitive (privacy_flag) — stricter PII redaction in events/traces.
export const engagementItems = pgTable(
  'engagement_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // comment | message
    platform: text('platform').notNull(),
    threadId: text('thread_id'),
    inboundText: text('inbound_text').notNull(),
    draftReply: text('draft_reply'),
    // drafted -> pending_approval -> approved | rejected -> sent
    status: text('status').notNull().default('pending_approval'),
    privacyFlag: boolean('privacy_flag').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('engagement_items_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Copy drafts (design §7.2). channel social|email; social has a platform,
// email has subject + preheader. status drives the approval flow.
export const contentDrafts = pgTable(
  'content_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id'),
    responseToAlertId: uuid('response_to_alert_id'),
    angleId: uuid('angle_id'),
    channel: text('channel').notNull(), // social | email
    platform: text('platform'), // facebook | twitter | instagram | linkedin (social)
    subject: text('subject'), // email
    preheader: text('preheader'), // email
    body: text('body').notNull(),
    rationale: text('rationale'),
    status: text('status').notNull().default('pending_approval'), // draft | pending_approval | approved | rejected
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_drafts_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

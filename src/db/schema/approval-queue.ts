import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Unified approval inbox (design §7.2): posts, emails, images, comment/DM replies.
// No publish/reply/send happens without an approved row here.
export const approvalQueue = pgTable(
  'approval_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull(), // content_draft | generated_asset | engagement_item
    resourceId: uuid('resource_id').notNull(),
    kind: text('kind').notNull(), // post | email | image | comment | message
    risk: text('risk').notNull().default('HIGH'), // LOW | MEDIUM | HIGH
    status: text('status').notNull().default('pending'), // pending | approved | rejected | edited
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approval_queue_tenant_status_idx').on(t.tenantId, t.status, t.createdAt.desc())],
);

// MEASURE anchor (design §7.2): one row per live post/email. No anchor, no metrics.
export const publishedItems = pgTable(
  'published_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').notNull(),
    platform: text('platform').notNull(),
    url: text('url'),
    mode: text('mode').notNull().default('copy_pack'), // copy_pack | api ('browser' reserved, ADR-001)
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('published_items_tenant_created_idx').on(t.tenantId, t.createdAt.desc())],
);

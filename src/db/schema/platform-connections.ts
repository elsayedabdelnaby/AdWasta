import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Per-tenant, per-platform publish mode + feature flags (design §10, §10.0).
// `publish_mode` live values are copy_pack | api. `browser` is reserved only
// (ADR-001); browser_publish_enabled stays false with no implementation.
export const platformConnections = pgTable(
  'platform_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // facebook | twitter | instagram | linkedin | email
    publishMode: text('publish_mode').notNull().default('copy_pack'), // copy_pack | api
    browserPublishEnabled: boolean('browser_publish_enabled').notNull().default(false), // reserved (ADR-001)
    apiPublishEnabled: boolean('api_publish_enabled').notNull().default(false),
    apiReplyEnabled: boolean('api_reply_enabled').notNull().default(false),
    apiDmReplyEnabled: boolean('api_dm_reply_enabled').notNull().default(false),
    apiAdsEnabled: boolean('api_ads_enabled').notNull().default(false),
    apiEmailEnabled: boolean('api_email_enabled').notNull().default(false),
    imageGenEnabled: boolean('image_gen_enabled').notNull().default(false),
    requireApprovalForPublish: boolean('require_approval_for_publish').notNull().default(true),
    requireApprovalForReply: boolean('require_approval_for_reply').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platform_connections_tenant_platform_key').on(t.tenantId, t.platform)],
);

import { pgTable, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Time-stamped metric captures per published item (design §12.2). Multiple
// captures = a time series. Fields are nullable per channel (social vs email).
export const postMetrics = pgTable(
  'post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    publishedItemId: uuid('published_item_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    impressions: integer('impressions'),
    reach: integer('reach'),
    likes: integer('likes'),
    comments: integer('comments'),
    shares: integer('shares'),
    clicks: integer('clicks'),
    saves: integer('saves'),
    videoViews: integer('video_views'),
    opens: integer('opens'),
    bounces: integer('bounces'),
    unsubscribes: integer('unsubscribes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_metrics_tenant_item_idx').on(t.tenantId, t.publishedItemId, t.capturedAt.desc())],
);

import { pgTable, uuid, text, timestamp, integer, numeric, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// AI-generated images (design §8.2). cost logged per variant; SynthID watermark
// is applied by Gemini with no API opt-out.
export const generatedAssets = pgTable(
  'generated_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').notNull(),
    url: text('url').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    variantIndex: integer('variant_index').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 5 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('generated_assets_tenant_draft_idx').on(t.tenantId, t.draftId)],
);

import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Visual direction per draft (design §8.2, SCALD-style). Always produced — even
// when image gen is off, the copy pack includes the prompt for a human designer.
export const visualBriefs = pgTable(
  'visual_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id').notNull(),
    format: text('format').notNull(),
    mood: text('mood'),
    aspectRatio: text('aspect_ratio').notNull().default('1:1'),
    scald: jsonb('scald').$type<Record<string, unknown>>().notNull().default({}),
    brandRefs: jsonb('brand_refs').$type<string[]>().notNull().default([]),
    prompt: text('prompt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visual_briefs_tenant_draft_idx').on(t.tenantId, t.draftId)],
);

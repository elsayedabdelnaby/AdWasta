import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// Soft calendar entries + optional armed execution (design §14). browser mode
// deferred (ADR-001); armed execution only via official API when enabled + valid.
export const schedules = pgTable(
  'schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id'),
    type: text('type').notNull(), // social_post | email_send
    platform: text('platform'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    reminderAt: timestamp('reminder_at', { withTimezone: true }),
    // pending -> reminded -> executing -> published | failed | skipped
    status: text('status').notNull().default('pending'),
    armed: boolean('armed').notNull().default(false),
    lastStep: text('last_step'), // checkpoint for resume
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('schedules_tenant_scheduled_idx').on(t.tenantId, t.scheduledAt)],
);

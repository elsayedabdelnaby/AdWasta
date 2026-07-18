import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';

// Eval suite results per pillar/deploy (design §7.2). SYSTEM/CI table — it holds
// no tenant data (evals run on golden fixtures), so it is intentionally NOT
// tenant-scoped and has no RLS policy, like the migrations bookkeeping table.
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pillar: text('pillar').notNull(),
    passed: integer('passed').notNull(),
    total: integer('total').notNull(),
    passRate: numeric('pass_rate', { precision: 5, scale: 4 }).notNull(),
    fixtures: integer('fixtures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('eval_runs_pillar_created_idx').on(t.pillar, t.createdAt.desc())],
);

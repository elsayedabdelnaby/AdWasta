import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import { systemEvents } from '../db/schema/system-events.js';
import { assertWithinBudget } from './budget.js';
import { UserFixableError } from './error-handler.js';

let db: Db;
const T = randomUUID();
const budget = { DAILY_BUDGET_USD: 1, MONTHLY_BUDGET_USD: 5, MAX_RUN_COST_USD: 2 };

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Budget Tenant' });
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM agent_traces WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('assertWithinBudget (design §6.1)', () => {
  it('passes when under budget', async () => {
    await expect(assertWithinBudget(db, T, { ...budget, DAILY_BUDGET_USD: 100 })).resolves.toBeUndefined();
  });

  it('aborts a run when run cost exceeds MAX_RUN_COST_USD', async () => {
    await expect(
      assertWithinBudget(db, T, budget, { runCostSoFar: 2.5 }),
    ).rejects.toBeInstanceOf(UserFixableError);
  });

  it('hard-stops and emits budget.hard_stop when daily spend crosses the cap', async () => {
    await db.withTenant(T, async (tx) => {
      await tx.insert(agentTraces).values({
        tenantId: T,
        arm: 'market',
        status: 'completed',
        totalCostUsd: '1.50', // over the $1 daily cap
      });
    });

    await expect(assertWithinBudget(db, T, budget)).rejects.toBeInstanceOf(UserFixableError);
    // called again while still over budget — must NOT emit a duplicate event
    await expect(assertWithinBudget(db, T, budget)).rejects.toBeInstanceOf(UserFixableError);

    const events = await db.withTenant(T, (tx) =>
      tx.select().from(systemEvents).where(eq(systemEvents.action, 'budget.hard_stop')),
    );
    expect(events).toHaveLength(1); // deduped to one per tenant-day
    expect(events[0]!.severity).toBe('critical');
  });
});

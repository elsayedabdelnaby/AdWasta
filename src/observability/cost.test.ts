import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import { costSummary } from './cost.js';

let db: Db;
const T = randomUUID();

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Cost Tenant' });
    await tx.insert(agentTraces).values([
      { tenantId: T, arm: 'market', status: 'completed', totalCostUsd: '0.10' },
      { tenantId: T, arm: 'market', status: 'completed', totalCostUsd: '0.05' },
      { tenantId: T, arm: 'strategy', status: 'completed', totalCostUsd: '0.40' },
    ]);
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM agent_traces WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('costSummary (design §18)', () => {
  it('aggregates cost total, by day, and by arm', async () => {
    const s = await costSummary(db, T, { days: 30 });
    expect(s.total).toBeCloseTo(0.55, 6);
    const market = s.byArm.find((r) => r.arm === 'market')!;
    expect(market.cost).toBeCloseTo(0.15, 6);
    const strategy = s.byArm.find((r) => r.arm === 'strategy')!;
    expect(strategy.cost).toBeCloseTo(0.4, 6);
    expect(s.byDay.reduce((a, r) => a + r.cost, 0)).toBeCloseTo(0.55, 6);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import { startTrace } from './trace.js';

let db: Db;
const T = randomUUID();

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Trace Tenant' });
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM agent_traces WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

async function readTrace(id: string) {
  return db.withTenant(T, async (tx) => {
    const rows = await tx.select().from(agentTraces).where(eq(agentTraces.id, id));
    return rows[0]!;
  });
}

describe('TraceCollector (design §18)', () => {
  it('starts a trace as running and persists it', async () => {
    const trace = await startTrace(db, T, { arm: 'market', crew: 'alex' });
    const row = await readTrace(trace.traceId);
    expect(row.status).toBe('running');
    expect(row.arm).toBe('market');
  });

  it('appends steps incrementally and aggregates cost + latency', async () => {
    const trace = await startTrace(db, T, { arm: 'market' });
    await trace.addStep({ action: 'llm.call', model: 'balanced', costUsd: 0.01, latencyMs: 200 });
    // partial trace is durable mid-run
    expect((await readTrace(trace.traceId)).steps).toHaveLength(1);
    await trace.addStep({ action: 'tool.call', tool: 'search_web', costUsd: 0.002, latencyMs: 50 });

    const row = await readTrace(trace.traceId);
    expect(row.steps).toHaveLength(2);
    expect(Number(row.totalCostUsd)).toBeCloseTo(0.012, 6);
    expect(row.totalLatencyMs).toBe(250);
  });

  it('finishes with a terminal status', async () => {
    const trace = await startTrace(db, T, { arm: 'market' });
    await trace.finish('completed');
    expect((await readTrace(trace.traceId)).status).toBe('completed');
  });
});

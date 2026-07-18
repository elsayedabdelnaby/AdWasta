import { sql, gte, eq, and } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { agentTraces } from '../db/schema/agent-traces.js';

export interface CostSummary {
  total: number;
  byDay: { day: string; cost: number }[];
  byArm: { arm: string | null; cost: number }[];
}

/**
 * Per-tenant cost rollup from agent_traces (design §18). Source of truth for
 * cost attribution (ADR-002 Decision 4) — Langfuse is for tracing, this is for
 * spend. Tenant-scoped via RLS.
 */
export async function costSummary(db: Db, tenantId: string, opts: { days?: number } = {}): Promise<CostSummary> {
  const days = opts.days ?? 30;
  const since = sql`now() - (${days} || ' days')::interval`;
  return db.withTenant(tenantId, async (tx) => {
    const byDay = await tx
      .select({ day: sql<string>`to_char(date_trunc('day', ${agentTraces.createdAt}), 'YYYY-MM-DD')`, cost: sql<number>`coalesce(sum(${agentTraces.totalCostUsd}), 0)::float8` })
      .from(agentTraces)
      .where(and(eq(agentTraces.tenantId, tenantId), gte(agentTraces.createdAt, since)))
      .groupBy(sql`date_trunc('day', ${agentTraces.createdAt})`)
      .orderBy(sql`date_trunc('day', ${agentTraces.createdAt})`);

    const byArm = await tx
      .select({ arm: agentTraces.arm, cost: sql<number>`coalesce(sum(${agentTraces.totalCostUsd}), 0)::float8` })
      .from(agentTraces)
      .where(and(eq(agentTraces.tenantId, tenantId), gte(agentTraces.createdAt, since)))
      .groupBy(agentTraces.arm);

    const total = byArm.reduce((a, r) => a + Number(r.cost), 0);
    return {
      total,
      byDay: byDay.map((r) => ({ day: r.day, cost: Number(r.cost) })),
      byArm: byArm.map((r) => ({ arm: r.arm, cost: Number(r.cost) })),
    };
  });
}

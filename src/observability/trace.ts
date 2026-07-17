import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { agentTraces, type TraceStep } from '../db/schema/agent-traces.js';

export interface TraceMeta {
  arm?: string;
  crew?: string;
  jobId?: string;
  campaignId?: string;
}

/**
 * Collects one arm/job run's LLM + tool steps (design §18). Steps are written
 * incrementally so a crashed run still leaves a partial trace. Tenant-scoped.
 */
export class TraceCollector {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    readonly traceId: string,
  ) {}

  async addStep(step: TraceStep): Promise<void> {
    // Append + increment in one statement — no read-modify-rewrite of the growing
    // array. Persists per step so a crashed run still leaves a partial trace.
    await this.db.withTenant(this.tenantId, async (tx) => {
      await tx
        .update(agentTraces)
        .set({
          steps: sql`${agentTraces.steps} || ${JSON.stringify([step])}::jsonb`,
          totalCostUsd: sql`${agentTraces.totalCostUsd} + ${step.costUsd ?? 0}`,
          totalLatencyMs: sql`${agentTraces.totalLatencyMs} + ${step.latencyMs ?? 0}`,
          updatedAt: new Date(),
        })
        .where(eq(agentTraces.id, this.traceId));
    });
  }

  async finish(status: 'completed' | 'failed'): Promise<void> {
    await this.db.withTenant(this.tenantId, async (tx) => {
      await tx
        .update(agentTraces)
        .set({ status, updatedAt: new Date() })
        .where(eq(agentTraces.id, this.traceId));
    });
  }
}

/** Create a running trace row and return a collector bound to it. */
export async function startTrace(
  db: Db,
  tenantId: string,
  meta: TraceMeta = {},
): Promise<TraceCollector> {
  const traceId = await db.withTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(agentTraces)
      .values({
        tenantId,
        arm: meta.arm,
        crew: meta.crew,
        jobId: meta.jobId,
        campaignId: meta.campaignId,
        status: 'running',
      })
      .returning({ id: agentTraces.id });
    return rows[0]!.id;
  });
  return new TraceCollector(db, tenantId, traceId);
}

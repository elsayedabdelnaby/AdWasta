import { sql, eq, desc } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { jobs } from '../db/schema/jobs.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { auditLog } from '../db/schema/audit-log.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import type { MemoryTurn, WorkingMemory } from './types.js';

// --- Short-term buffer (on the job record) ---

export async function appendShortTerm(
  db: Db,
  tenantId: string,
  jobId: string,
  turn: MemoryTurn,
): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    await tx
      .update(jobs)
      .set({ shortTerm: sql`${jobs.shortTerm} || ${JSON.stringify([turn])}::jsonb`, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

export async function readShortTerm(db: Db, tenantId: string, jobId: string): Promise<MemoryTurn[]> {
  return db.withTenant(tenantId, async (tx) => {
    const [row] = await tx.select({ shortTerm: jobs.shortTerm }).from(jobs).where(eq(jobs.id, jobId));
    return (row?.shortTerm ?? []) as MemoryTurn[];
  });
}

export async function replaceShortTerm(
  db: Db,
  tenantId: string,
  jobId: string,
  turns: MemoryTurn[],
): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    await tx.update(jobs).set({ shortTerm: turns, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  });
}

// --- Working memory (on the job record) ---

export async function mergeWorkingMemory(
  db: Db,
  tenantId: string,
  jobId: string,
  patch: WorkingMemory,
): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    await tx
      .update(jobs)
      .set({ workingMemory: sql`${jobs.workingMemory} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

export async function readWorkingMemory(
  db: Db,
  tenantId: string,
  jobId: string,
): Promise<WorkingMemory> {
  return db.withTenant(tenantId, async (tx) => {
    const [row] = await tx.select({ wm: jobs.workingMemory }).from(jobs).where(eq(jobs.id, jobId));
    return (row?.wm ?? {}) as WorkingMemory;
  });
}

// --- Long-term (stable cross-session facts) ---
// tenant_profiles today; personas + marketing_plans join as their phases land.

export async function readLongTerm(db: Db, tenantId: string) {
  return db.withTenant(tenantId, async (tx) => {
    const [profile] = await tx
      .select()
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    return { profile: profile ?? null };
  });
}

// --- Episodic (what happened before) ---
// audit_log + agent_traces today; intel_snapshots joins in Phase 1.

export async function readEpisodic(
  db: Db,
  tenantId: string,
  opts: { limit?: number } = {},
) {
  const limit = opts.limit ?? 20;
  return db.withTenant(tenantId, async (tx) => {
    const audit = await tx.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
    const traces = await tx
      .select()
      .from(agentTraces)
      .orderBy(desc(agentTraces.createdAt))
      .limit(limit);
    return { audit, traces };
  });
}

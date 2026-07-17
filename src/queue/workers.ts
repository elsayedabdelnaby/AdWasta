import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { jobs } from '../db/schema/jobs.js';
import { emitEvent } from '../observability/events.js';
import { ARM_JOBS_QUEUE, createRedis, type ArmJobData } from './jobs.js';

/**
 * Phase 0 worker skeleton: no arm logic yet. It marks the job running then
 * completed with a stub result. Crucially it derives the tenant from the jobs
 * RECORD (a narrow owner lookup), never from the queue payload (ADR-002).
 */
export function startArmWorker(
  db: Db,
  redisUrl: string,
  name: string = ARM_JOBS_QUEUE,
): Worker<ArmJobData> {
  return new Worker<ArmJobData>(
    name,
    async (job: Job<ArmJobData>) => {
      const { jobId } = job.data;
      const rec = await db.adminPool.query('SELECT tenant_id, arm FROM jobs WHERE id = $1', [jobId]);
      const row = rec.rows[0] as { tenant_id: string; arm: string } | undefined;
      if (!row) return; // stale queue entry — the record is authoritative

      const tenantId = row.tenant_id;
      await db.withTenant(tenantId, async (tx) => {
        await tx.update(jobs).set({ status: 'running', updatedAt: new Date() }).where(eq(jobs.id, jobId));
        const result = { stub: true, arm: row.arm }; // real arm dispatch arrives in later phases
        await tx
          .update(jobs)
          .set({ status: 'completed', result, updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
        await emitEvent(tx, tenantId, {
          actorType: 'system',
          category: 'job',
          action: 'job.completed',
          resourceType: 'job',
          resourceId: jobId,
          jobId,
          message: `job ${row.arm} completed (stub)`,
        });
      });
    },
    { connection: createRedis(redisUrl) },
  );
}

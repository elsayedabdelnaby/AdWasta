import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { jobs } from '../db/schema/jobs.js';

export const ARM_JOBS_QUEUE = 'arm-jobs';

/** BullMQ payload. Only the jobId travels — the worker reads tenant + arm from
 *  the jobs record, never trusting queue input for tenant identity (ADR-002). */
export interface ArmJobData {
  jobId: string;
}

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export function createArmQueue(redisUrl: string, name: string = ARM_JOBS_QUEUE): Queue<ArmJobData> {
  return new Queue<ArmJobData>(name, { connection: createRedis(redisUrl) });
}

/**
 * Persist a queued job row (tenant-scoped) then enqueue it. tenantId is the
 * already-authenticated req.tenantId — resolved from session membership, not
 * user input. Returns the job id used both as the DB PK and the BullMQ job id.
 */
export async function enqueueArmJob(
  db: Db,
  queue: Queue<ArmJobData>,
  args: { tenantId: string; arm: string; input?: Record<string, unknown> },
): Promise<string> {
  const jobId = await db.withTenant(args.tenantId, async (tx) => {
    const rows = await tx
      .insert(jobs)
      .values({ tenantId: args.tenantId, arm: args.arm, input: args.input ?? {}, status: 'queued' })
      .returning({ id: jobs.id });
    return rows[0]!.id;
  });
  try {
    await queue.add('arm', { jobId }, { jobId, removeOnComplete: true, removeOnFail: 100 });
  } catch (err) {
    // The row is already committed; if enqueue fails, mark it failed rather than
    // leaving an orphan stuck in 'queued' with no BullMQ job behind it.
    await db.withTenant(args.tenantId, (tx) =>
      tx
        .update(jobs)
        .set({ status: 'failed', error: 'failed to enqueue', updatedAt: new Date() })
        .where(eq(jobs.id, jobId)),
    );
    throw err;
  }
  return jobId;
}

/** Read a job within its tenant scope. */
export async function getArmJob(db: Db, tenantId: string, jobId: string) {
  return db.withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(jobs).where(eq(jobs.id, jobId));
    return rows[0] ?? null;
  });
}

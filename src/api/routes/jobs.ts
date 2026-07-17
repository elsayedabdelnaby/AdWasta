import { z } from 'zod';
import type { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { enqueueArmJob, getArmJob, type ArmJobData } from '../../queue/jobs.js';

const EnqueueSchema = z.object({
  arm: z.string().min(1).max(64),
  input: z.record(z.unknown()).optional(),
});

export function registerJobRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; queue: Queue<ArmJobData> },
): void {
  const { db, hooks, queue } = deps;

  app.post('/tenants/:id/jobs', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const { arm, input } = EnqueueSchema.parse(req.body);
    const jobId = await enqueueArmJob(db, queue, { tenantId: req.tenantId!, arm, input });
    return reply.code(202).send({ id: jobId, status: 'queued' });
  });

  // Bare resource route: authorize by resolving the job's tenant, then read it
  // within that tenant's RLS scope.
  app.get('/jobs/:id', async (req, reply) => {
    const jobId = (req.params as { id: string }).id;
    const tenantId = await hooks.authorizeResource(req, reply, 'jobs', jobId);
    if (!tenantId) return; // already replied 401/403/404
    const job = await getArmJob(db, tenantId, jobId);
    if (!job) return reply.code(404).send({ error: 'not found' });
    return job;
  });
}

import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import type { Db } from '../../db/client.js';
import type { ArmJobData } from '../../queue/jobs.js';

export interface HealthDeps {
  db: Db;
  redis?: Redis;
  jobQueue?: Queue<ArmJobData>;
}

/**
 * Liveness (`/healthz`) and readiness (`/readyz`) — both public (design §23).
 * Readiness probes Postgres, Redis, and BullMQ queue depth; 503 if a hard
 * dependency (Postgres/Redis) is down so orchestrators stop routing traffic.
 */
export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/health', async () => ({ status: 'ok' })); // alias (docs/docker.md)

  app.get('/readyz', async (_req, reply) => {
    const checks: {
      postgres: boolean;
      redis?: boolean;
      queue?: Record<string, number> | { error: true };
    } = { postgres: false };

    try {
      await deps.db.adminPool.query('select 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    if (deps.redis) {
      try {
        checks.redis = (await deps.redis.ping()) === 'PONG';
      } catch {
        checks.redis = false;
      }
    }

    if (deps.jobQueue) {
      try {
        checks.queue = await deps.jobQueue.getJobCounts();
      } catch {
        checks.queue = { error: true };
      }
    }

    const ready = checks.postgres && (deps.redis === undefined || checks.redis === true);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'degraded', checks });
  });
}

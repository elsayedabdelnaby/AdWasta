import { desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { startTrace } from '../../observability/trace.js';
import { dailyBriefs } from '../../db/schema/daily-briefs.js';
import { runDailyStrategist, type DailyStrategistDeps } from '../../brain/daily-strategist.js';
import { createRedis } from '../../queue/jobs.js';
import type { ResearchProviders } from './intel.js';

export const DAILY_BRIEF_QUEUE = 'daily-brief';

export function registerOpsRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ResearchProviders },
): void {
  const { db, hooks, providers } = deps;

  app.post('/tenants/:id/daily-brief', { preHandler: hooks.requireTenantMember }, async (req) => {
    const tenantId = req.tenantId!;
    const trace = await startTrace(db, tenantId, { crew: 'ops', arm: 'daily_strategist' });
    const d: DailyStrategistDeps = { db, llm: providers.llm, models: providers.models, trace, traceId: trace.traceId };
    try {
      const result = await runDailyStrategist(d, tenantId);
      await trace.finish('completed');
      return result;
    } catch (err) {
      await trace.finish('failed');
      throw err;
    }
  });

  app.get('/tenants/:id/daily-brief', { preHandler: hooks.requireTenantMember }, async (req) => {
    const briefs = await db.withTenant(req.tenantId!, (tx) =>
      tx.select().from(dailyBriefs).orderBy(desc(dailyBriefs.createdAt)).limit(7),
    );
    return { briefs };
  });
}

/** Per-tenant repeatable daily brief (Task 4.2). Worker wiring lands with the
 *  research-capable worker; cron respects the tenant timezone. */
export function scheduleDailyBrief(redisUrl: string, tenantId: string, cron = '0 8 * * *', tz = 'UTC'): Queue {
  const queue = new Queue(DAILY_BRIEF_QUEUE, { connection: createRedis(redisUrl) });
  void queue.add('brief', { tenantId }, { repeat: { pattern: cron, tz }, jobId: `daily-brief:${tenantId}` });
  return queue;
}

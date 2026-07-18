import { and, eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { competitors } from '../../db/schema/competitors.js';
import { emitEvent } from '../../observability/events.js';
import { createRedis } from '../../queue/jobs.js';
import { runCompetitorArm } from './run.js';
import type { IntelArmDeps } from '../intel-arm.js';

export const COMPETITOR_WATCH_QUEUE = 'competitor-watch';
const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h (design §12.1)

/**
 * One competitor-watch cycle (Task 1.4b): run the competitor arm for every
 * watch-enabled competitor and surface alerts. Lighter cadence than an on-demand
 * deep run, but the same arm + detect_campaign_change path.
 */
export async function runCompetitorWatchCycle(
  deps: IntelArmDeps,
  tenantId: string,
): Promise<{ analyzed: number; alerts: number }> {
  const comps = await deps.db.withTenant(tenantId, (tx) =>
    tx
      .select({ id: competitors.id })
      .from(competitors)
      .where(and(eq(competitors.tenantId, tenantId), eq(competitors.watchEnabled, true))),
  );

  let alerts = 0;
  for (const c of comps) {
    const res = await runCompetitorArm(deps, tenantId, c.id);
    if (res.alertId) alerts += 1;
  }

  await deps.db.withTenant(tenantId, (tx) =>
    emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'competitor.watch_ran',
      message: `competitor watch: ${comps.length} analyzed, ${alerts} alert(s)`,
      payload: { analyzed: comps.length, alerts },
    }),
  );
  return { analyzed: comps.length, alerts };
}

/** Register the per-tenant repeatable watch job (worker wiring lands with the
 *  research-capable worker). Interval is tenant-configurable. */
export function scheduleCompetitorWatch(
  redisUrl: string,
  tenantId: string,
  everyMs: number = DEFAULT_INTERVAL_MS,
): Queue {
  const queue = new Queue(COMPETITOR_WATCH_QUEUE, { connection: createRedis(redisUrl) });
  void queue.add(
    'watch',
    { tenantId },
    { repeat: { every: everyMs }, jobId: `competitor-watch:${tenantId}` },
  );
  return queue;
}

import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { competitors } from '../db/schema/competitors.js';
import { emitEvent } from '../observability/events.js';
import type { IntelArmDeps } from '../arms/intel-arm.js';
import { runMarketArm } from '../arms/market/run.js';
import { runTrendArm } from '../arms/trends/run.js';
import { runCompetitorArm, type CompetitorArmResult } from '../arms/competitors/run.js';
import type { MarketData } from '../arms/market/prompts.js';
import type { TrendData } from '../arms/trends/prompts.js';
import type { ArmResult } from '../harness/types.js';

export interface ResearchResult {
  market: ArmResult<MarketData>;
  trend: ArmResult<TrendData>;
  competitors: CompetitorArmResult[];
  summary: string;
  citations: string[];
}

/**
 * Run the full RESEARCH crew (Alex) — Market, Trend, and every watch-enabled
 * Competitor arm CONCURRENTLY (design §8.2 parallelism, Task 1.5), then merge into
 * one RESEARCH summary for the Strategy crew. Each arm persists its own cited
 * snapshot; this returns the combined handoff.
 */
export async function runResearchCrew(deps: IntelArmDeps, tenantId: string): Promise<ResearchResult> {
  const comps = await deps.db.withTenant(tenantId, (tx) =>
    tx
      .select({ id: competitors.id })
      .from(competitors)
      .where(and(eq(competitors.tenantId, tenantId), eq(competitors.watchEnabled, true))),
  );

  // Market + Trend are required; the (possibly many) competitor arms are resilient
  // — one competitor's LLM failure shouldn't discard the whole crew's output.
  const [market, trend, competitorSettled] = await Promise.all([
    runMarketArm(deps, tenantId),
    runTrendArm(deps, tenantId),
    Promise.allSettled(comps.map((c) => runCompetitorArm(deps, tenantId, c.id))),
  ]);
  const competitorResults = competitorSettled
    .filter((r): r is PromiseFulfilledResult<CompetitorArmResult> => r.status === 'fulfilled')
    .map((r) => r.value);
  const failedCompetitors = competitorSettled.length - competitorResults.length;

  const citations = [
    ...new Set([
      ...(market.citations ?? []),
      ...(trend.citations ?? []),
      ...competitorResults.flatMap((c) => c.citations ?? []),
    ]),
  ];
  const alerts = competitorResults.filter((c) => c.alertId).length;
  const failedNote = failedCompetitors > 0 ? ` (${failedCompetitors} competitor arm(s) failed)` : '';
  const summary =
    `RESEARCH complete — market: ${market.summary}; trend: ${trend.summary}; ` +
    `${competitorResults.length} competitor(s) analyzed, ${alerts} campaign alert(s)${failedNote}.`;

  await deps.db.withTenant(tenantId, (tx) =>
    emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'research.finished',
      severity: failedCompetitors > 0 ? 'warning' : 'info',
      message: summary,
      payload: { competitors: competitorResults.length, alerts, failedCompetitors },
    }),
  );

  return { market, trend, competitors: competitorResults, summary, citations };
}

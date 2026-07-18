import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { LlmClient, StepSink } from '../../llm/openrouter.js';
import type { ModelTiers } from '../../config/model-routing.js';
import { publishedItems } from '../../db/schema/approval-queue.js';
import { postMetrics } from '../../db/schema/post-metrics.js';
import { contentDrafts } from '../../db/schema/content-drafts.js';
import { messagingAngles } from '../../db/schema/messaging-angles.js';
import { performanceInsights } from '../../db/schema/performance-insights.js';
import { emitEvent } from '../../observability/events.js';
import { computeItemStats, summarizeGroup, groupBy, type MetricRow } from '../../metrics/stats.js';

export interface AnalystDeps {
  db: Db;
  llm?: LlmClient;
  models?: ModelTiers;
  trace?: StepSink;
  traceId?: string;
}

export interface AnalystResult {
  insightIds: string[];
  scoredAngles: number;
  winningAngleId?: string;
  losingAngleId?: string;
}

interface Observation {
  metricId: string;
  itemId: string;
  angleId: string;
  rate: number;
}

/**
 * Analyst arm (Riley, MEASURE). Reads PRE-COMPUTED stats from src/metrics/ — it
 * never crunches raw numbers (design §12.2, non-negotiable). Facts (winning/losing
 * angle, scores, citations, provisional) are derived in code; the LLM only writes
 * the interpretive summary. Every insight cites post_metrics row ids; groups below
 * the min sample are `provisional` and excluded from scoring.
 */
export async function runAnalystArm(deps: AnalystDeps, tenantId: string): Promise<AnalystResult> {
  const observations = await loadObservations(deps.db, tenantId);
  const byAngle = groupBy(observations, (o) => o.angleId);

  // Per-angle summaries from the deterministic stats module.
  const summaries = [...byAngle.entries()].map(([angleId, obs]) => ({
    angleId,
    metricIds: obs.map((o) => o.metricId),
    summary: summarizeGroup(angleId, obs.map((o) => o.rate)),
  }));

  const sufficient = summaries.filter((s) => s.summary.sufficient);
  const ranked = [...sufficient].sort((a, b) => b.summary.mean - a.summary.mean);
  const winningAngleId = ranked[0]?.angleId;
  const losingAngleId = ranked.length > 1 ? ranked[ranked.length - 1]?.angleId : undefined;

  const insightIds: string[] = [];
  let scoredAngles = 0;

  await deps.db.withTenant(tenantId, async (tx) => {
    for (const s of summaries) {
      const provisional = !s.summary.sufficient;
      const kind = !provisional && s.angleId === winningAngleId
        ? 'winning_angle'
        : !provisional && s.angleId === losingAngleId
          ? 'losing_angle'
          : 'angle';
      const summaryText = await interpret(deps, kind, s.summary.mean, s.summary.n, provisional);

      const [row] = await tx
        .insert(performanceInsights)
        .values({ tenantId, kind, summary: summaryText, citedMetricIds: s.metricIds, provisional, data: { angleId: s.angleId, mean: s.summary.mean, n: s.summary.n } })
        .returning({ id: performanceInsights.id });
      insightIds.push(row!.id);

      // Score + retire only on a sufficient sample.
      if (!provisional) {
        await tx.update(messagingAngles).set({ performanceScore: s.summary.mean.toFixed(3) }).where(and(eq(messagingAngles.id, s.angleId), eq(messagingAngles.tenantId, tenantId)));
        scoredAngles += 1;
        if (s.angleId === losingAngleId) {
          await tx.update(messagingAngles).set({ status: 'retired' }).where(and(eq(messagingAngles.id, s.angleId), eq(messagingAngles.tenantId, tenantId)));
        }
      }
    }

    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'measure',
      action: 'insight.generated',
      message: `analyst: ${insightIds.length} insights, ${scoredAngles} angles scored`,
      payload: { insights: insightIds.length, scored: scoredAngles },
    });
    if (scoredAngles > 0) {
      await emitEvent(tx, tenantId, { actorType: 'crew', category: 'measure', action: 'angle.score_updated', message: `${scoredAngles} angle scores updated` });
    }
  });

  return { insightIds, scoredAngles, winningAngleId, losingAngleId };
}

async function loadObservations(db: Db, tenantId: string): Promise<Observation[]> {
  const rows = await db.withTenant(tenantId, (tx) =>
    tx
      .select({
        metricId: postMetrics.id,
        itemId: publishedItems.id,
        capturedAt: postMetrics.capturedAt,
        angleId: contentDrafts.angleId,
        reach: postMetrics.reach,
        likes: postMetrics.likes,
        comments: postMetrics.comments,
        shares: postMetrics.shares,
        saves: postMetrics.saves,
        impressions: postMetrics.impressions,
        clicks: postMetrics.clicks,
        opens: postMetrics.opens,
      })
      .from(postMetrics)
      .innerJoin(publishedItems, eq(postMetrics.publishedItemId, publishedItems.id))
      .leftJoin(contentDrafts, eq(publishedItems.draftId, contentDrafts.id))
      .orderBy(desc(postMetrics.capturedAt)),
  );

  // One observation per item (latest capture wins), grouped by its angle.
  const latestByItem = new Map<string, Observation>();
  for (const r of rows) {
    if (latestByItem.has(r.itemId)) continue; // rows are captured_at DESC
    const stats = computeItemStats(r as unknown as MetricRow);
    if (stats.engagementRate === null) continue;
    latestByItem.set(r.itemId, { metricId: r.metricId, itemId: r.itemId, angleId: r.angleId ?? 'unknown', rate: stats.engagementRate });
  }
  return [...latestByItem.values()];
}

async function interpret(deps: AnalystDeps, kind: string, mean: number, n: number, provisional: boolean): Promise<string> {
  const facts = `${kind} — mean engagement ${(mean * 100).toFixed(1)}% over ${n} item(s)${provisional ? ' (provisional: below min sample)' : ''}`;
  if (!deps.llm || !deps.models) return facts;
  try {
    const res = await deps.llm.chat({
      model: deps.models.balanced,
      trace: deps.trace,
      messages: [
        { role: 'system', content: 'You are Riley, a performance analyst. Interpret the PROVIDED stats in one sentence. Do NOT invent or recompute numbers.' },
        { role: 'user', content: facts },
      ],
    });
    return res.text.trim() || facts;
  } catch {
    return facts; // interpretation is cosmetic; the facts are code-derived
  }
}

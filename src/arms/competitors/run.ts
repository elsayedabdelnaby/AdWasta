import { and, desc, eq } from 'drizzle-orm';
import type { ArmResult } from '../../harness/types.js';
import { competitors, competitorAlerts } from '../../db/schema/competitors.js';
import { intelSnapshots } from '../../db/schema/intel-snapshots.js';
import { emitAudit } from '../../observability/events.js';
import { runIntelArm, type IntelArmDeps } from '../intel-arm.js';
import { CompetitorSchema, buildCompetitorMessages, type CompetitorData } from './prompts.js';

export interface CompetitorArmResult extends ArmResult<CompetitorData> {
  alertId?: string;
}

// Competitor arm (RESEARCH, deep). Analyzes a competitor, diffs vs the previous
// snapshot (detect_campaign_change), and — on a real signal — opens a
// competitor_alert + emits competitor.campaign_detected. MODEL_DEEP (Task 1.4).
export async function runCompetitorArm(
  deps: IntelArmDeps,
  tenantId: string,
  competitorId: string,
  opts: { extraContext?: string } = {},
): Promise<CompetitorArmResult> {
  const { competitor, previousSummary } = await deps.db.withTenant(tenantId, async (tx) => {
    const [c] = await tx.select().from(competitors).where(eq(competitors.id, competitorId));
    if (!c) throw new Error(`competitor ${competitorId} not found`);
    const [prev] = await tx
      .select({ summary: intelSnapshots.summary })
      .from(intelSnapshots)
      .where(and(eq(intelSnapshots.type, 'competitor'), eq(intelSnapshots.competitorId, competitorId)))
      .orderBy(desc(intelSnapshots.createdAt))
      .limit(1);
    return { competitor: c, previousSummary: prev?.summary ?? null };
  });

  const query = [competitor.name, competitor.url, 'news campaign launch promo'].filter(Boolean).join(' ');

  const { result } = await runIntelArm(deps, tenantId, {
    type: 'competitor',
    arm: 'competitors',
    tier: 'deep',
    queries: [query],
    competitorId,
    schema: CompetitorSchema,
    buildMessages: (sanitized) => buildCompetitorMessages(competitor, previousSummary, sanitized),
    summarize: (d) => d.summary,
    extraContext: opts.extraContext,
  });

  let alertId: string | undefined;
  if (result.data.campaignSignal) {
    alertId = await deps.db.withTenant(tenantId, async (tx) => {
      const [alert] = await tx
        .insert(competitorAlerts)
        .values({
          tenantId,
          competitorId,
          summary: result.data.signalSummary,
          citations: result.citations ?? [],
          status: 'open',
        })
        .returning({ id: competitorAlerts.id });
      await emitAudit(tx, tenantId, {
        actorType: 'crew',
        category: 'campaign',
        action: 'competitor.campaign_detected',
        resourceType: 'competitor_alert',
        resourceId: alert!.id,
        message: `rival campaign detected: ${competitor.name}`,
        payload: { competitorId, competitor: competitor.name },
      });
      return alert!.id;
    });
  }

  return { ...result, alertId };
}

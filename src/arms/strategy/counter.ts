import { eq } from 'drizzle-orm';
import { routeModel } from '../../config/model-routing.js';
import { competitorAlerts, competitors } from '../../db/schema/competitors.js';
import { campaigns } from '../../db/schema/campaigns.js';
import { messagingAngles } from '../../db/schema/messaging-angles.js';
import { emitAudit } from '../../observability/events.js';
import { AnglesSchema, buildCounterAnglesMessages } from './prompts.js';
import type { StrategyDeps } from './generate.js';

export interface CounterCampaignResult {
  campaignId: string;
  angleCount: number;
}

/**
 * Counter-campaign assist (Task 2.4b, design §12.1). From a competitor alert:
 * open a campaign (kind=counter, linked to the alert), generate DIFFERENTIATING
 * response angles, and persist them. CREATION (Phase 3) continues from campaign_id.
 */
export async function generateCounterCampaign(
  deps: StrategyDeps,
  tenantId: string,
  competitorAlertId: string,
): Promise<CounterCampaignResult> {
  const { alert, competitorName } = await deps.db.withTenant(tenantId, async (tx) => {
    const [a] = await tx.select().from(competitorAlerts).where(eq(competitorAlerts.id, competitorAlertId));
    if (!a) throw Object.assign(new Error('competitor alert not found'), { statusCode: 404 });
    const [c] = await tx.select({ name: competitors.name }).from(competitors).where(eq(competitors.id, a.competitorId));
    return { alert: a, competitorName: c?.name ?? 'competitor' };
  });

  const anglesOut = await deps.llm.structuredComplete({
    model: routeModel('deep', deps.models),
    schema: AnglesSchema,
    trace: deps.trace,
    messages: buildCounterAnglesMessages(competitorName, alert.summary),
  });

  return deps.db.withTenant(tenantId, async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({ tenantId, kind: 'counter', responseToAlertId: competitorAlertId, goal: `counter ${competitorName}` })
      .returning({ id: campaigns.id });
    await tx.insert(messagingAngles).values(
      anglesOut.angles.map((a) => ({ tenantId, channel: a.channel, angle: a.angle, hooks: a.hooks, proofPoints: a.proofPoints })),
    );
    await emitAudit(tx, tenantId, {
      actorType: 'user',
      category: 'campaign',
      action: 'campaign.counter_started',
      resourceType: 'campaign',
      resourceId: campaign!.id,
      campaignId: campaign!.id,
      message: `counter-campaign started vs ${competitorName}`,
      payload: { competitorAlertId, competitor: competitorName },
    });
    return { campaignId: campaign!.id, angleCount: anglesOut.angles.length };
  });
}

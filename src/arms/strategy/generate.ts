import { and, desc, eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { LlmClient, type StepSink } from '../../llm/openrouter.js';
import { routeModel, type ModelTiers } from '../../config/model-routing.js';
import { intelSnapshots } from '../../db/schema/intel-snapshots.js';
import { icpProfiles } from '../../db/schema/icp-profiles.js';
import { personas as personasTable } from '../../db/schema/personas.js';
import { messagingAngles } from '../../db/schema/messaging-angles.js';
import { marketingPlans } from '../../db/schema/marketing-plans.js';
import { emitEvent } from '../../observability/events.js';
import { loadPerformanceContext } from '../../metrics/feedback.js';
import type { ArmResult } from '../../harness/types.js';
import {
  ICPSchema,
  PersonasSchema,
  AnglesSchema,
  PlanSchema,
  buildIcpMessages,
  buildPersonasMessages,
  buildAnglesMessages,
  buildPlanMessages,
} from './prompts.js';

export interface StrategyDeps {
  db: Db;
  llm: LlmClient;
  models: ModelTiers;
  trace?: StepSink;
  traceId?: string;
}

export interface StrategyResultData {
  icpId: string;
  personaCount: number;
  angleCount: number;
  planId: string;
}

/**
 * Strategy crew (Sam), sequential: ICP → personas → angles → plan (Task 2.4).
 * Each step reads the prior step's output from the DB — no inter-agent chat.
 * Consumes RESEARCH summaries (not raw SERP). MODEL_DEEP throughout.
 */
export async function generateStrategy(
  deps: StrategyDeps,
  tenantId: string,
  opts: { audienceModel?: 'b2b' | 'b2c' } = {},
): Promise<ArmResult<StrategyResultData>> {
  const model = routeModel('deep', deps.models);

  // 0) RESEARCH context (summaries only) + competitor hooks to differentiate from.
  const { research, competitorHooks } = await deps.db.withTenant(tenantId, async (tx) => {
    const snaps = await tx
      .select({ type: intelSnapshots.type, summary: intelSnapshots.summary, data: intelSnapshots.data })
      .from(intelSnapshots)
      .orderBy(desc(intelSnapshots.createdAt))
      .limit(6);
    const research = snaps.map((s) => `[${s.type}] ${s.summary}`).join('\n');
    const comp = snaps.find((s) => s.type === 'competitor');
    const hooks = (comp?.data?.hooks as string[] | undefined) ?? [];
    return { research, competitorHooks: hooks.join('; ') };
  });

  // 1) ICP
  const audienceModel = opts.audienceModel ?? 'b2c';
  const icp = await deps.llm.structuredComplete({ model, schema: ICPSchema, trace: deps.trace, messages: buildIcpMessages(audienceModel, research) });
  const icpId = await deps.db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(icpProfiles)
      .values({ tenantId, audienceModel: icp.audienceModel, segments: icp.segments, triggers: icp.triggers, objections: icp.objections, summary: icp.summary })
      .returning({ id: icpProfiles.id });
    return row!.id;
  });

  // 2) Personas (read ICP)
  const personasOut = await deps.llm.structuredComplete({ model, schema: PersonasSchema, trace: deps.trace, messages: buildPersonasMessages(icp.summary) });
  await deps.db.withTenant(tenantId, async (tx) => {
    await tx.insert(personasTable).values(
      personasOut.personas.map((p) => ({ tenantId, icpId, name: p.name, description: p.description, pains: p.pains, goals: p.goals, channels: p.channels })),
    );
  });

  // 3) Angles (read personas + competitor hooks + measured performance)
  const personaContext = personasOut.personas.map((p) => `${p.name}: ${p.description}`).join('\n');
  const performance = await loadPerformanceContext(deps.db, tenantId);
  const anglesOut = await deps.llm.structuredComplete({ model, schema: AnglesSchema, trace: deps.trace, messages: buildAnglesMessages(personaContext, competitorHooks, performance) });
  const angleIds = await deps.db.withTenant(tenantId, async (tx) => {
    // Retire the previous run's angles so only the current strategy is active.
    await tx
      .update(messagingAngles)
      .set({ status: 'retired' })
      .where(and(eq(messagingAngles.tenantId, tenantId), eq(messagingAngles.status, 'active')));
    const rows = await tx
      .insert(messagingAngles)
      .values(anglesOut.angles.map((a) => ({ tenantId, channel: a.channel, angle: a.angle, hooks: a.hooks, proofPoints: a.proofPoints })))
      .returning({ id: messagingAngles.id });
    return rows.map((r) => r.id);
  });

  // 4) Plan (read angles), then link the angles to it.
  const anglesContext = anglesOut.angles.map((a) => `[${a.channel}] ${a.angle}`).join('\n');
  const planOut = await deps.llm.structuredComplete({ model, schema: PlanSchema, trace: deps.trace, messages: buildPlanMessages(anglesContext) });
  const planId = await deps.db.withTenant(tenantId, async (tx) => {
    // Version the plan and archive the prior active one so there's a single
    // active plan per tenant (design §7.2 versioned plans).
    const [maxRow] = await tx.select({ v: max(marketingPlans.version) }).from(marketingPlans).where(eq(marketingPlans.tenantId, tenantId));
    const nextVersion = Number(maxRow?.v ?? 0) + 1;
    await tx
      .update(marketingPlans)
      .set({ status: 'archived' })
      .where(and(eq(marketingPlans.tenantId, tenantId), eq(marketingPlans.status, 'active')));
    const [row] = await tx
      .insert(marketingPlans)
      .values({ tenantId, version: nextVersion, horizonDays: planOut.horizonDays, channels: planOut.channels, themes: planOut.themes, kpis: planOut.kpis })
      .returning({ id: marketingPlans.id });
    await tx
      .update(messagingAngles)
      .set({ planId: row!.id })
      .where(and(inArray(messagingAngles.id, angleIds), eq(messagingAngles.tenantId, tenantId)));
    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'strategy.finished',
      resourceType: 'marketing_plan',
      resourceId: row!.id,
      message: `strategy complete: ${personasOut.personas.length} personas, ${anglesOut.angles.length} angles`,
    });
    return row!.id;
  });

  const data: StrategyResultData = { icpId, personaCount: personasOut.personas.length, angleCount: anglesOut.angles.length, planId };
  return {
    arm: 'strategy',
    tenantId,
    traceId: deps.traceId ?? planId,
    summary: `Strategy: ${audienceModel} ICP, ${data.personaCount} personas, ${data.angleCount} angles, 90-day plan.`,
    data,
  };
}

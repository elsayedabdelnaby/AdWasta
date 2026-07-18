import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ArmResult } from '../../harness/types.js';
import { competitors } from '../../db/schema/competitors.js';
import { intelSnapshots } from '../../db/schema/intel-snapshots.js';
import { routeModel } from '../../config/model-routing.js';
import { sanitizeExternal } from '../../guardrails/sanitize-external.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { emitEvent } from '../../observability/events.js';
import type { IntelArmDeps } from '../intel-arm.js';
import { runCompetitorArm } from './run.js';
import { ComparisonSchema, buildComparisonMessages, type ComparisonData } from './prompts.js';

/**
 * Competitor COMPARISON (RESEARCH, Alex, deep). Makes sure every watch-enabled
 * competitor has been studied (runs the analyze arm for any without a snapshot),
 * then compares them against each other AND against the client's business —
 * positioning, strengths/weaknesses, threat level, our advantages/gaps, and
 * recommendations. Persists an intel snapshot (type=competitor_comparison) whose
 * citations are the union of the underlying per-competitor citations.
 */
export async function compareCompetitors(deps: IntelArmDeps, tenantId: string): Promise<ArmResult<ComparisonData>> {
  const { business, comps } = await deps.db.withTenant(tenantId, async (tx) => {
    const [t] = await tx
      .select({ name: tenants.name, industry: tenants.industry })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!t) throw new Error(`tenant ${tenantId} not found`);
    const [p] = await tx
      .select({ description: tenantProfiles.description, audience: tenantProfiles.audience })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    const rows = await tx
      .select({ id: competitors.id, name: competitors.name })
      .from(competitors)
      .where(and(eq(competitors.tenantId, tenantId), eq(competitors.watchEnabled, true)));
    return {
      business: {
        name: t.name,
        industry: t.industry ?? undefined,
        description: p?.description ?? undefined,
        audience: p?.audience ?? undefined,
      },
      comps: rows,
    };
  });

  if (comps.length === 0) {
    throw new Error('no watched competitors to compare — run discovery or add competitors in onboarding first');
  }

  // Latest study per competitor; study the ones never analyzed before comparing.
  const latest = new Map<string, { summary: string; data: Record<string, unknown>; citations: string[] }>();
  const snapshots = await deps.db.withTenant(tenantId, (tx) =>
    tx
      .select({
        competitorId: intelSnapshots.competitorId,
        summary: intelSnapshots.summary,
        data: intelSnapshots.data,
        citations: intelSnapshots.citations,
      })
      .from(intelSnapshots)
      .where(
        and(
          eq(intelSnapshots.type, 'competitor'),
          inArray(
            intelSnapshots.competitorId,
            comps.map((c) => c.id),
          ),
        ),
      )
      .orderBy(desc(intelSnapshots.createdAt)),
  );
  for (const s of snapshots) {
    if (s.competitorId && !latest.has(s.competitorId)) {
      latest.set(s.competitorId, { summary: s.summary, data: s.data, citations: s.citations });
    }
  }
  for (const c of comps) {
    if (latest.has(c.id)) continue;
    const res = await runCompetitorArm(deps, tenantId, c.id);
    latest.set(c.id, {
      summary: res.summary,
      data: res.data as unknown as Record<string, unknown>,
      citations: res.citations ?? [],
    });
  }

  const contextParts = comps.map((c) => {
    const s = latest.get(c.id)!;
    return `## Competitor: ${c.name}\nSummary: ${s.summary}\nAnalysis: ${JSON.stringify(s.data)}`;
  });
  const sanitized = sanitizeExternal(contextParts.join('\n\n'));

  const data: ComparisonData = await deps.llm.structuredComplete({
    model: routeModel('deep', deps.models),
    messages: buildComparisonMessages(business, sanitized),
    schema: ComparisonSchema,
    trace: deps.trace,
  });

  const citations = [...new Set(comps.flatMap((c) => latest.get(c.id)!.citations))];

  const snapshotId = await deps.db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(intelSnapshots)
      .values({
        tenantId,
        type: 'competitor_comparison',
        summary: data.summary,
        data: data as unknown as Record<string, unknown>,
        citations,
      })
      .returning({ id: intelSnapshots.id });
    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'intel.comparison_captured',
      resourceType: 'intel_snapshot',
      resourceId: row!.id,
      message: `compared ${comps.length} competitor(s)`,
      payload: { competitors: comps.map((c) => c.name) },
    });
    return row!.id;
  });

  return {
    arm: 'competitors',
    tenantId,
    traceId: deps.traceId ?? snapshotId,
    summary: data.summary,
    data,
    citations,
  };
}

import { eq } from 'drizzle-orm';
import type { ArmResult } from '../../harness/types.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { runIntelArm, type IntelArmDeps } from '../intel-arm.js';
import { TrendSchema, buildTrendMessages, type TrendData } from './prompts.js';

// Trend arm — Tier 1 analysis (LLM). Runs only on Tier-0 detected change / force /
// 24h staleness (ADR-003), never on a fixed hourly clock. MODEL_BALANCED.
export async function runTrendArm(
  deps: IntelArmDeps,
  tenantId: string,
  opts: { changeContext?: string } = {},
): Promise<ArmResult<TrendData>> {
  const ctx = await deps.db.withTenant(tenantId, async (tx) => {
    const [t] = await tx.select({ industry: tenants.industry }).from(tenants).where(eq(tenants.id, tenantId));
    const [p] = await tx
      .select({ audience: tenantProfiles.audience })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    return { industry: t?.industry ?? undefined, audience: p?.audience ?? undefined };
  });

  const query = [ctx.industry, ctx.audience, 'trends news this week'].filter(Boolean).join(' ');

  const { result } = await runIntelArm(deps, tenantId, {
    type: 'trend',
    arm: 'trends',
    tier: 'balanced',
    queries: [query],
    schema: TrendSchema,
    buildMessages: (sanitized) => buildTrendMessages(ctx, sanitized),
    summarize: (d) => d.summary,
    extraContext: opts.changeContext,
  });
  return result;
}

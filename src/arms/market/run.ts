import { eq } from 'drizzle-orm';
import type { ArmResult } from '../../harness/types.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { runIntelArm, type IntelArmDeps } from '../intel-arm.js';
import { MarketSchema, buildMarketMessages, type MarketData } from './prompts.js';

// Market arm (RESEARCH, Alex). SERP / market intelligence → intel_snapshots
// type=market with required citations. MODEL_BALANCED (design §6, Task 1.2).
export async function runMarketArm(deps: IntelArmDeps, tenantId: string): Promise<ArmResult<MarketData>> {
  const ctx = await deps.db.withTenant(tenantId, async (tx) => {
    const [t] = await tx.select({ industry: tenants.industry }).from(tenants).where(eq(tenants.id, tenantId));
    const [p] = await tx
      .select({ audience: tenantProfiles.audience, description: tenantProfiles.description })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    return { industry: t?.industry ?? undefined, audience: p?.audience ?? undefined };
  });

  const query = [ctx.industry, ctx.audience, 'market demand trends keywords'].filter(Boolean).join(' ');

  const { result } = await runIntelArm(deps, tenantId, {
    type: 'market',
    arm: 'market',
    tier: 'balanced',
    queries: [query],
    schema: MarketSchema,
    buildMessages: (sanitized) => buildMarketMessages(ctx, sanitized),
    summarize: (d) => d.summary,
  });
  return result;
}

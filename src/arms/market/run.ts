import { eq } from 'drizzle-orm';
import type { ArmResult } from '../../harness/types.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { runIntelArm, type IntelArmDeps } from '../intel-arm.js';
import { fetchPage } from '../../tools/fetch-page.js';
import { MarketSchema, buildMarketMessages, type MarketData } from './prompts.js';

// Market arm (RESEARCH, Alex). SERP / market intelligence → intel_snapshots
// type=market with required citations. MODEL_BALANCED (design §6, Task 1.2).
export async function runMarketArm(deps: IntelArmDeps, tenantId: string): Promise<ArmResult<MarketData>> {
  const ctx = await deps.db.withTenant(tenantId, async (tx) => {
    const [t] = await tx.select({ industry: tenants.industry }).from(tenants).where(eq(tenants.id, tenantId));
    const [p] = await tx
      .select({
        audience: tenantProfiles.audience,
        description: tenantProfiles.description,
        website: tenantProfiles.website,
        socialUrls: tenantProfiles.socialUrls,
      })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    return {
      industry: t?.industry ?? undefined,
      audience: p?.audience ?? undefined,
      website: p?.website ?? undefined,
      socialUrls: p?.socialUrls ?? undefined,
    };
  });

  const query = [ctx.industry, ctx.audience, 'market demand trends keywords'].filter(Boolean).join(' ');

  // Learn from the tenant's own website: fetch the homepage text and fold it
  // into the (untrusted, sanitized) research context. A dead site never fails
  // the run — the arm just proceeds on search context alone.
  let websiteContext: string | undefined;
  let websiteCitations: string[] | undefined;
  if (ctx.website) {
    const page = await fetchPage(ctx.website, { fetchImpl: deps.pageFetch });
    if (page.status === 'ok' && page.text) {
      websiteContext = `# The business's own website (${ctx.website})\n${page.text}`;
      websiteCitations = [ctx.website];
    }
  }

  const { result } = await runIntelArm(deps, tenantId, {
    type: 'market',
    arm: 'market',
    tier: 'balanced',
    queries: [query],
    schema: MarketSchema,
    buildMessages: (sanitized) => buildMarketMessages(ctx, sanitized),
    summarize: (d) => d.summary,
    extraContext: websiteContext,
    extraCitations: websiteCitations,
  });
  return result;
}

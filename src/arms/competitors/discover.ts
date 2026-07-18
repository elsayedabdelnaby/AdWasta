import { eq } from 'drizzle-orm';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { competitors } from '../../db/schema/competitors.js';
import { routeModel } from '../../config/model-routing.js';
import { sanitizeExternal } from '../../guardrails/sanitize-external.js';
import { emitAudit } from '../../observability/events.js';
import type { IntelArmDeps } from '../intel-arm.js';
import { DiscoverySchema, buildDiscoveryMessages, type DiscoveryData } from './prompts.js';

export interface DiscoveredCompetitor {
  id: string;
  name: string;
  url?: string;
  why: string;
}

export interface DiscoveryResult {
  /** Newly inserted (now watch-enabled) competitors. */
  discovered: DiscoveredCompetitor[];
  /** Candidates skipped because they were already tracked (or duplicated). */
  skipped: string[];
  summary: string;
  citations: string[];
}

/**
 * Competitor DISCOVERY (RESEARCH, Alex). Searches the web from the onboarded
 * business profile (industry, description, audience), has the LLM extract real
 * rival businesses, and inserts the new ones into the tenant's `competitors`
 * watch table — so the analyze/compare arms have subjects without the owner
 * typing names by hand. ToS-safe sources only (design §12): public web search,
 * never login-gated scraping.
 */
export async function discoverCompetitors(deps: IntelArmDeps, tenantId: string): Promise<DiscoveryResult> {
  const { business, tracked } = await deps.db.withTenant(tenantId, async (tx) => {
    const [t] = await tx
      .select({ name: tenants.name, industry: tenants.industry })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!t) throw new Error(`tenant ${tenantId} not found`);
    const [p] = await tx
      .select({
        description: tenantProfiles.description,
        audience: tenantProfiles.audience,
        website: tenantProfiles.website,
      })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.tenantId, tenantId));
    const rows = await tx.select({ name: competitors.name }).from(competitors);
    return {
      business: {
        name: t.name,
        industry: t.industry ?? undefined,
        description: p?.description ?? undefined,
        audience: p?.audience ?? undefined,
        website: p?.website ?? undefined,
      },
      tracked: rows.map((r) => r.name),
    };
  });

  // Two angles of attack: category-level ("top X brands") and the business's own
  // description (truncated — search engines choke on paragraph-length queries).
  const queries = [
    [business.industry ?? business.name, business.audience, 'top competitors brands alternatives']
      .filter(Boolean)
      .join(' '),
  ];
  if (business.description) queries.push(`${business.description.slice(0, 160)} competitors`);

  const citations: string[] = [];
  const contextParts: string[] = [];
  for (const q of queries) {
    const res = await deps.search.search(q);
    citations.push(...res.citations);
    for (const r of res.results) contextParts.push(`# ${r.title}\n${r.snippet}\n(${r.url})`);
  }
  const sanitized = sanitizeExternal(contextParts.join('\n\n'));

  const data: DiscoveryData = await deps.llm.structuredComplete({
    model: routeModel('balanced', deps.models),
    messages: buildDiscoveryMessages(business, tracked, sanitized),
    schema: DiscoverySchema,
    trace: deps.trace,
  });

  // Dedupe against tracked rows and the client itself, then persist the rest.
  const knownLower = new Set([business.name.toLowerCase(), ...tracked.map((n) => n.toLowerCase())]);
  const discovered: DiscoveredCompetitor[] = [];
  const skipped: string[] = [];
  await deps.db.withTenant(tenantId, async (tx) => {
    for (const c of data.competitors) {
      const name = c.name.trim();
      if (!name || knownLower.has(name.toLowerCase())) {
        skipped.push(name || c.name);
        continue;
      }
      knownLower.add(name.toLowerCase());
      const [row] = await tx
        .insert(competitors)
        .values({ tenantId, name, url: c.url })
        .returning({ id: competitors.id });
      discovered.push({ id: row!.id, name, url: c.url, why: c.why });
    }
    if (discovered.length > 0) {
      await emitAudit(tx, tenantId, {
        actorType: 'crew',
        category: 'campaign',
        action: 'competitor.discovered',
        resourceType: 'competitor',
        message: `discovered ${discovered.length} competitor(s): ${discovered.map((d) => d.name).join(', ')}`,
        payload: { names: discovered.map((d) => d.name) },
      });
    }
  });

  return { discovered, skipped, summary: data.summary, citations: [...new Set(citations)] };
}

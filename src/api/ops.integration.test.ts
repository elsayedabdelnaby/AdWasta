import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { marketingPlans } from '../db/schema/marketing-plans.js';
import { competitors, competitorAlerts } from '../db/schema/competitors.js';
import { dailyBriefs } from '../db/schema/daily-briefs.js';
import { agentTraces } from '../db/schema/agent-traces.js';

// Brief includes an INVENTED platform (tiktok) that the guard must drop.
const briefFixture = {
  emailPriorities: ['send the summer promo'],
  socialPriorities: [
    { platform: 'facebook', priority: 'post the cold brew launch' },
    { platform: 'tiktok', priority: 'invented — not in profile' },
  ],
  performanceHighlights: ['loyalty angle is winning'],
  counterCampaignCta: 'counter Blue Bottle’s promo',
};
const transport: LlmTransport = async () => ({ text: JSON.stringify(briefFixture), usage: { promptTokens: 1, completionTokens: 1 }, model: 'test' });

const OWNER = 'user_owner';
let app: FastifyInstance;
let db: Db;
const created: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({
    config: loadConfig(),
    db,
    research: { llm: new LlmClient({ transport, sleep: async () => {} }), search: new FixtureSearchProvider({}), models: { fast: 'f', balanced: 'b', deep: 'd' } },
  });
  await app.ready();
});

afterAll(async () => {
  for (const id of created) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function seedTenant(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Aurora', industry: 'coffee' } });
  const id = res.json().id as string;
  created.push(id);
  await db.withTenant(id, async (tx) => {
    await tx.insert(tenantProfiles).values({ tenantId: id, platforms: ['facebook', 'email'], competitors: ['Blue Bottle'] });
    await tx.insert(marketingPlans).values({ tenantId: id, channels: ['email', 'social'], themes: ['local'], kpis: [] });
    const [c] = await tx.insert(competitors).values({ tenantId: id, name: 'Blue Bottle' }).returning({ id: competitors.id });
    await tx.insert(competitorAlerts).values({ tenantId: id, competitorId: c!.id, summary: 'summer promo' });
  });
  return id;
}

describe('OPS daily strategist (Tasks 4.1–4.3)', () => {
  it('generates a brief from real state and drops invented platforms', async () => {
    const id = await seedTenant();
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/daily-brief`, headers: { 'x-dev-user': OWNER } });
    expect(res.statusCode).toBe(200);
    expect(res.json().openAlerts).toBe(1);

    const [brief] = await db.withTenant(id, (tx) => tx.select().from(dailyBriefs).where(eq(dailyBriefs.tenantId, id)));
    // tiktok (not in profile.platforms) is filtered out; only facebook remains
    expect(brief.socialPriorities.map((p) => p.platform)).toEqual(['facebook']);
    expect(brief.emailPriorities.length).toBeGreaterThan(0);
    expect(brief.counterCampaignCta).toBeTruthy();

    // trace logged + finished
    const traces = await db.withTenant(id, (tx) => tx.select().from(agentTraces).where(eq(agentTraces.crew, 'ops')));
    expect(traces.length).toBeGreaterThanOrEqual(1);
    expect(traces.every((t) => t.status === 'completed')).toBe(true);
  });

  it('lists recent briefs; requires auth (401) and membership (403)', async () => {
    const id = await seedTenant();
    await app.inject({ method: 'POST', url: `/tenants/${id}/daily-brief`, headers: { 'x-dev-user': OWNER } });
    const list = await app.inject({ method: 'GET', url: `/tenants/${id}/daily-brief`, headers: { 'x-dev-user': OWNER } });
    expect(list.json().briefs.length).toBeGreaterThanOrEqual(1);
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/daily-brief` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/daily-brief`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

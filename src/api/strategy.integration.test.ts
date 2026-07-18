import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { intelSnapshots } from '../db/schema/intel-snapshots.js';
import { competitors, competitorAlerts } from '../db/schema/competitors.js';
import { icpProfiles } from '../db/schema/icp-profiles.js';
import { personas } from '../db/schema/personas.js';
import { messagingAngles } from '../db/schema/messaging-angles.js';
import { marketingPlans } from '../db/schema/marketing-plans.js';
import { campaigns } from '../db/schema/campaigns.js';
import { systemEvents } from '../db/schema/system-events.js';

const icpFixture = { audienceModel: 'b2c', segments: ['cafe-goers', 'remote workers'], triggers: ['new routine'], objections: ['price'], summary: 'b2c coffee ICP' };
const personasFixture = { personas: [
  { name: 'Chris', description: 'commuter', pains: ['time'], goals: ['fast'], channels: ['social'] },
  { name: 'Riley', description: 'remote', pains: ['focus'], goals: ['wifi'], channels: ['email'] },
  { name: 'Wanda', description: 'explorer', pains: ['boredom'], goals: ['novelty'], channels: ['social'] },
] };
const anglesFixture = { angles: [
  { channel: 'social', angle: 'local sourcing', hooks: ['meet the roaster'], proofPoints: ['single origin'] },
  { channel: 'email', angle: 'loyalty perks', hooks: ['10th free'], proofPoints: ['member pricing'] },
  { channel: 'social', angle: 'seasonal drops', hooks: ['back for summer'], proofPoints: ['limited runs'] },
] };
const planFixture = { horizonDays: 90, channels: ['email', 'social'], themes: ['community'], kpis: [{ name: 'reach', class: 'awareness' }] };

const transport: LlmTransport = async ({ messages }) => {
  const sys = messages.map((m) => m.content).join(' ');
  const data = sys.includes('Ideal Customer Profile')
    ? icpFixture
    : sys.includes('buyer personas')
      ? personasFixture
      : sys.includes('90-day marketing plan')
        ? planFixture
        : anglesFixture;
  return { text: JSON.stringify(data), usage: { promptTokens: 5, completionTokens: 5 }, model: 'test' };
};

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
    await tx.insert(tenantProfiles).values({ tenantId: id, audience: 'cafe-goers' });
    await tx.insert(intelSnapshots).values({ tenantId: id, type: 'competitor', summary: 'rival active', data: { hooks: ['limited time'] }, citations: ['https://x'] });
  });
  return id;
}

describe('STRATEGY crew (Tasks 2.1–2.4)', () => {
  it('generates ICP → personas → angles → plan and persists all four', async () => {
    const id = await seedTenant();
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/strategy/generate`, headers: { 'x-dev-user': OWNER }, payload: { audienceModel: 'b2c' } });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.personaCount).toBe(3);
    expect(data.angleCount).toBe(3);

    const rows = await db.withTenant(id, async (tx) => ({
      icp: await tx.select().from(icpProfiles).where(eq(icpProfiles.tenantId, id)),
      personas: await tx.select().from(personas).where(eq(personas.tenantId, id)),
      angles: await tx.select().from(messagingAngles).where(eq(messagingAngles.tenantId, id)),
      plans: await tx.select().from(marketingPlans).where(eq(marketingPlans.tenantId, id)),
    }));
    expect(rows.icp).toHaveLength(1);
    expect(rows.personas.length).toBeGreaterThanOrEqual(2);
    expect(rows.personas.length).toBeLessThanOrEqual(4);
    expect(rows.angles.length).toBeGreaterThanOrEqual(3);
    expect(rows.angles.every((a) => a.planId === rows.plans[0]!.id)).toBe(true); // angles linked to plan
    expect(rows.plans[0]!.channels).toEqual(expect.arrayContaining(['email', 'social']));
  });

  it('re-running strategy versions the plan and archives the prior active one', async () => {
    const id = await seedTenant();
    const gen = () => app.inject({ method: 'POST', url: `/tenants/${id}/strategy/generate`, headers: { 'x-dev-user': OWNER }, payload: {} });
    await gen();
    await gen();
    const plans = await db.withTenant(id, (tx) => tx.select().from(marketingPlans).where(eq(marketingPlans.tenantId, id)));
    const active = plans.filter((p) => p.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]!.version).toBe(2);
    // only the current run's angles are active
    const activeAngles = await db.withTenant(id, (tx) => tx.select().from(messagingAngles).where(eq(messagingAngles.tenantId, id)));
    expect(activeAngles.filter((a) => a.status === 'active')).toHaveLength(3);
  });

  it('starts a counter-campaign from a competitor alert', async () => {
    const id = await seedTenant();
    const alertId = await db.withTenant(id, async (tx) => {
      const [c] = await tx.insert(competitors).values({ tenantId: id, name: 'Blue Bottle' }).returning({ id: competitors.id });
      const [a] = await tx.insert(competitorAlerts).values({ tenantId: id, competitorId: c!.id, summary: 'summer promo burst' }).returning({ id: competitorAlerts.id });
      return a!.id;
    });

    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/campaign/counter`, headers: { 'x-dev-user': OWNER }, payload: { competitorAlertId: alertId } });
    expect(res.statusCode).toBe(200);
    expect(res.json().angleCount).toBeGreaterThanOrEqual(3);

    const camps = await db.withTenant(id, (tx) => tx.select().from(campaigns).where(eq(campaigns.tenantId, id)));
    expect(camps[0]!.kind).toBe('counter');
    expect(camps[0]!.responseToAlertId).toBe(alertId);
    const evts = await db.withTenant(id, (tx) => tx.select().from(systemEvents).where(eq(systemEvents.action, 'campaign.counter_started')));
    expect(evts.length).toBeGreaterThanOrEqual(1);
  });

  it('requires membership (403) and auth (401)', async () => {
    const id = await seedTenant();
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/strategy/generate` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/strategy/generate`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

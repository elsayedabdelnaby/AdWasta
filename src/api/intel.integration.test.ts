import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { competitors } from '../db/schema/competitors.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import { eq } from 'drizzle-orm';

const marketFixture = { keywords: ['cold brew'], demandSignals: ['rising'], serpLandscape: 'x', categoryGaps: ['y'], summary: 'market ok' };
const trendFixture = { trends: [{ name: 'oat milk', relevance: 'high', why: 'demand' }], summary: 'trend ok' };
const competitorFixture = { cadence: 'daily', themes: ['t'], hooks: ['h'], gaps: ['g'], recommendations: ['r'], campaignSignal: true, signalSummary: 'summer promo burst detected', summary: 'competitor ok' };

const transport: LlmTransport = async ({ messages }) => {
  const sys = messages.map((m) => m.content).join(' ');
  const data = sys.includes('market research') ? marketFixture : sys.includes('trend analyst') ? trendFixture : competitorFixture;
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
    research: {
      llm: new LlmClient({ transport, sleep: async () => {} }),
      search: new FixtureSearchProvider({ '*': [{ title: 'Coffee 2026', url: 'https://ex.com/c', snippet: 'up' }] }),
      models: { fast: 'f', balanced: 'b', deep: 'd' },
    },
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
    await tx.insert(competitors).values({ tenantId: id, name: 'Blue Bottle', url: 'https://bb.example' });
  });
  return id;
}

describe('RESEARCH API (Task 1.5)', () => {
  it('runs the full research crew and reports cited output + alerts', async () => {
    const id = await seedTenant();
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/research/run`, headers: { 'x-dev-user': OWNER } });
    expect(res.statusCode).toBe(200);
    expect(res.json().citations).toContain('https://ex.com/c');
    expect(res.json().alerts).toBe(1);

    // the request's trace is finished, not left 'running'
    const traces = await db.withTenant(id, (tx) =>
      tx.select().from(agentTraces).where(eq(agentTraces.crew, 'research')),
    );
    expect(traces.length).toBeGreaterThanOrEqual(1);
    expect(traces.every((t) => t.status === 'completed')).toBe(true);
  });

  it('runs a single arm via /intel/market', async () => {
    const id = await seedTenant();
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/intel/market`, headers: { 'x-dev-user': OWNER } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.keywords).toContain('cold brew');
  });

  it('lists then dismisses a competitor alert', async () => {
    const id = await seedTenant();
    await app.inject({ method: 'POST', url: `/tenants/${id}/research/run`, headers: { 'x-dev-user': OWNER } });
    const list = await app.inject({ method: 'GET', url: `/tenants/${id}/competitor-alerts`, headers: { 'x-dev-user': OWNER } });
    const alerts = list.json().alerts;
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    const dismiss = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/competitor-alerts/${alerts[0].id}/dismiss`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(dismiss.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/tenants/${id}/competitor-alerts`, headers: { 'x-dev-user': OWNER } });
    expect(after.json().alerts.find((a: { id: string }) => a.id === alerts[0].id)).toBeUndefined();
  });

  it('requires membership (403) and auth (401)', async () => {
    const id = await seedTenant();
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/research/run` })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: `/tenants/${id}/research/run`, headers: { 'x-dev-user': 'stranger' } })).statusCode,
    ).toBe(403);
  });
});

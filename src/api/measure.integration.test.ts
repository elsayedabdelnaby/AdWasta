import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { messagingAngles } from '../db/schema/messaging-angles.js';
import { contentDrafts } from '../db/schema/content-drafts.js';
import { publishedItems } from '../db/schema/approval-queue.js';
import { postMetrics } from '../db/schema/post-metrics.js';
import { performanceInsights } from '../db/schema/performance-insights.js';

const transport: LlmTransport = async () => ({ text: 'Interpretation of the provided stats.', usage: { promptTokens: 1, completionTokens: 1 }, model: 'test' });

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

async function newTenant(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Aurora', industry: 'coffee' } });
  const id = res.json().id as string;
  created.push(id);
  return id;
}

// Seed `count` published items on `angleId` with a fixed `likes`/reach=100 metric.
async function seedItems(tenantId: string, angleId: string, count: number, likes: number): Promise<string[]> {
  return db.withTenant(tenantId, async (tx) => {
    const metricIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const [draft] = await tx.insert(contentDrafts).values({ tenantId, angleId, channel: 'social', platform: 'facebook', body: `post ${i}`, status: 'approved' }).returning({ id: contentDrafts.id });
      const [item] = await tx.insert(publishedItems).values({ tenantId, draftId: draft!.id, platform: 'facebook' }).returning({ id: publishedItems.id });
      const [metric] = await tx.insert(postMetrics).values({ tenantId, publishedItemId: item!.id, reach: 100, likes }).returning({ id: postMetrics.id });
      metricIds.push(metric!.id);
    }
    return metricIds;
  });
}

describe('MEASURE pillar (Tasks 3.5.1–3.5.6)', () => {
  it('planted winner + loser identified and cited; small group stays provisional', async () => {
    const id = await newTenant();
    const [angleA, angleB, angleC] = await db.withTenant(id, async (tx) => {
      const rows = await tx.insert(messagingAngles).values([
        { tenantId: id, channel: 'social', angle: 'winner angle' },
        { tenantId: id, channel: 'social', angle: 'loser angle' },
        { tenantId: id, channel: 'social', angle: 'small-sample angle' },
      ]).returning({ id: messagingAngles.id });
      return [rows[0]!.id, rows[1]!.id, rows[2]!.id];
    });

    const aMetrics = await seedItems(id, angleA, 5, 20); // rate 0.20 (winner)
    await seedItems(id, angleB, 5, 1); // rate 0.01 (loser)
    await seedItems(id, angleC, 2, 5); // n=2 -> provisional

    const run = await app.inject({ method: 'POST', url: `/tenants/${id}/analyst/run`, headers: { 'x-dev-user': OWNER } });
    expect(run.statusCode).toBe(200);
    const result = run.json();
    expect(result.winningAngleId).toBe(angleA);
    expect(result.losingAngleId).toBe(angleB);

    const insights = await db.withTenant(id, (tx) => tx.select().from(performanceInsights).where(eq(performanceInsights.tenantId, id)));
    const winning = insights.find((i) => i.kind === 'winning_angle')!;
    const losing = insights.find((i) => i.kind === 'losing_angle')!;
    const small = insights.find((i) => (i.data as { angleId: string }).angleId === angleC)!;

    // every claim cites post_metrics rows
    expect(winning.citedMetricIds.length).toBe(5);
    expect(winning.citedMetricIds.sort()).toEqual(aMetrics.sort());
    expect(losing.citedMetricIds.length).toBe(5);
    // below min sample -> provisional
    expect(small.provisional).toBe(true);

    // angle scores updated; loser retired; provisional angle NOT scored
    const angles = await db.withTenant(id, (tx) => tx.select().from(messagingAngles).where(eq(messagingAngles.tenantId, id)));
    const a = angles.find((x) => x.id === angleA)!;
    const b = angles.find((x) => x.id === angleB)!;
    const c = angles.find((x) => x.id === angleC)!;
    expect(Number(a.performanceScore)).toBeCloseTo(0.2, 3);
    expect(b.status).toBe('retired');
    expect(c.performanceScore).toBeNull();
  });

  it('import validates against published_items and triggers the analyst', async () => {
    const id = await newTenant();
    const [angle] = await db.withTenant(id, (tx) => tx.insert(messagingAngles).values({ tenantId: id, channel: 'social', angle: 'x' }).returning({ id: messagingAngles.id }));
    // one real published item + a bogus id
    const realItemId = await db.withTenant(id, async (tx) => {
      const [d] = await tx.insert(contentDrafts).values({ tenantId: id, angleId: angle!.id, channel: 'social', body: 'b', status: 'approved' }).returning({ id: contentDrafts.id });
      const [it] = await tx.insert(publishedItems).values({ tenantId: id, draftId: d!.id, platform: 'facebook' }).returning({ id: publishedItems.id });
      return it!.id;
    });
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/metrics/import`,
      headers: { 'x-dev-user': OWNER },
      payload: { rows: [{ publishedItemId: realItemId, reach: 100, likes: 10 }, { publishedItemId: '11111111-1111-4111-8111-111111111111', reach: 5, likes: 1 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(1);
    expect(res.json().skipped).toHaveLength(1);
  });

  it('requires membership (403) and auth (401)', async () => {
    const id = await newTenant();
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/analyst/run` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/tenants/${id}/insights`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

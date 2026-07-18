import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { StubImageAdapter } from '../adapters/image/stub.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { marketingPlans } from '../db/schema/marketing-plans.js';
import { messagingAngles } from '../db/schema/messaging-angles.js';
import { contentDrafts } from '../db/schema/content-drafts.js';
import { visualBriefs } from '../db/schema/visual-briefs.js';
import { generatedAssets } from '../db/schema/generated-assets.js';

const contentFixture = {
  drafts: [
    { channel: 'social', platform: 'facebook', body: 'Try our cold brew at https://aurora.coffee/menu #coldbrew', rationale: 'aligns to local sourcing angle', visualBrief: { format: 'photo', mood: 'warm', aspectRatio: '1:1', prompt: 'nitro cold brew glass on wood' } },
    { channel: 'email', subject: 'Cold brew is back', preheader: 'summer menu', body: 'Visit https://aurora.coffee/summer for the new menu', rationale: 'loyalty angle' },
  ],
};

const seenPrompts: string[] = [];
const transport: LlmTransport = async ({ messages }) => {
  seenPrompts.push(messages.map((m) => m.content).join('\n'));
  return { text: JSON.stringify(contentFixture), usage: { promptTokens: 5, completionTokens: 5 }, model: 'test' };
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
    imageAdapter: new StubImageAdapter(),
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
    await tx.insert(tenantProfiles).values({ tenantId: id, voice: 'warm, unpretentious' });
    await tx.insert(marketingPlans).values({ tenantId: id, channels: ['email', 'social'], themes: ['local'], kpis: [] });
    await tx.insert(messagingAngles).values({ tenantId: id, channel: 'social', angle: 'local sourcing' });
  });
  return id;
}

describe('CREATION pillar (Tasks 3.1–3.8)', () => {
  it('recommends drafts with visual briefs, UTM links, images, and approval rows', async () => {
    const id = await seedTenant();
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend`, headers: { 'x-dev-user': OWNER }, payload: { platforms: ['facebook'], imageGenEnabled: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().draftIds).toHaveLength(2);
    expect(res.json().imageCount).toBe(1); // one social draft -> one stub image

    const rows = await db.withTenant(id, async (tx) => ({
      drafts: await tx.select().from(contentDrafts).where(eq(contentDrafts.tenantId, id)),
      briefs: await tx.select().from(visualBriefs).where(eq(visualBriefs.tenantId, id)),
      assets: await tx.select().from(generatedAssets).where(eq(generatedAssets.tenantId, id)),
    }));
    const social = rows.drafts.find((d) => d.channel === 'social')!;
    expect(social.body).toContain('utm_campaign='); // UTM always on
    expect(social.body).toContain('utm_content=');
    expect(social.angleId).toBeTruthy(); // linked to an angle so MEASURE can group
    expect(rows.briefs.length).toBeGreaterThanOrEqual(1); // visual brief always for social
    expect(rows.assets).toHaveLength(1);
  });

  it('writes copy in the requested language (and falls back to the tenant locale)', async () => {
    // Explicit request language wins.
    const id = await seedTenant();
    seenPrompts.length = 0;
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend`, headers: { 'x-dev-user': OWNER }, payload: { platforms: ['facebook'], language: 'ar' } });
    expect(res.statusCode).toBe(200);
    expect(seenPrompts.join('\n')).toContain('in Arabic');

    // No request language: the tenant's locale drives it.
    const res2 = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Boulangerie', industry: 'bakery', locale: 'fr' } });
    const frId = res2.json().id as string;
    created.push(frId);
    await db.withTenant(frId, async (tx) => {
      await tx.insert(marketingPlans).values({ tenantId: frId, channels: ['social'], themes: ['artisan'], kpis: [] });
      await tx.insert(messagingAngles).values({ tenantId: frId, channel: 'social', angle: 'fresh daily' });
    });
    seenPrompts.length = 0;
    const res3 = await app.inject({ method: 'POST', url: `/tenants/${frId}/content/recommend`, headers: { 'x-dev-user': OWNER }, payload: { platforms: ['facebook'] } });
    expect(res3.statusCode).toBe(200);
    expect(seenPrompts.join('\n')).toContain('in French');
  });

  it('runs the approve loop → copy pack → mark published', async () => {
    const id = await seedTenant();
    await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend`, headers: { 'x-dev-user': OWNER }, payload: { platforms: ['facebook'] } });

    const inbox = await app.inject({ method: 'GET', url: `/tenants/${id}/approvals`, headers: { 'x-dev-user': OWNER } });
    const post = inbox.json().posts[0];
    expect(post).toBeDefined();

    const decide = await app.inject({ method: 'POST', url: `/tenants/${id}/approvals/${post.id}/decide`, headers: { 'x-dev-user': OWNER }, payload: { decision: 'approve' } });
    expect(decide.statusCode).toBe(200);

    const draftId = post.resourceId as string;
    const pack = await app.inject({ method: 'GET', url: `/tenants/${id}/content/${draftId}/copy-pack`, headers: { 'x-dev-user': OWNER } });
    expect(pack.statusCode).toBe(200);
    expect(pack.json().hashtags).toContain('#coldbrew');
    expect(pack.json().imagePrompt).toBeDefined(); // no image generated this run

    const published = await app.inject({ method: 'POST', url: `/tenants/${id}/published-items`, headers: { 'x-dev-user': OWNER }, payload: { draftId, platform: 'facebook' } });
    expect(published.statusCode).toBe(200);
    expect(published.json().published).toBe(true);
  });

  it('refuses to mark an unapproved draft as published (409)', async () => {
    const id = await seedTenant();
    await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend`, headers: { 'x-dev-user': OWNER }, payload: { platforms: ['facebook'] } });
    const drafts = await db.withTenant(id, (tx) => tx.select().from(contentDrafts).where(eq(contentDrafts.tenantId, id)));
    const res = await app.inject({ method: 'POST', url: `/tenants/${id}/published-items`, headers: { 'x-dev-user': OWNER }, payload: { draftId: drafts[0]!.id, platform: 'facebook' } });
    expect(res.statusCode).toBe(409);
  });

  it('requires membership (403) and auth (401)', async () => {
    const id = await seedTenant();
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/tenants/${id}/content/recommend`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

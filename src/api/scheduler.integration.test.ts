import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { contentDrafts } from '../db/schema/content-drafts.js';
import { platformConnections } from '../db/schema/platform-connections.js';

const OWNER = 'user_owner';
let app: FastifyInstance;
let db: Db;
const created: string[] = [];
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({ config: loadConfig(), db });
  await app.ready();
});

afterAll(async () => {
  for (const id of created) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function seed(): Promise<{ tenantId: string; approvedDraft: string; pendingDraft: string }> {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Aurora' } });
  const tenantId = res.json().id as string;
  created.push(tenantId);
  const ids = await db.withTenant(tenantId, async (tx) => {
    const [a] = await tx.insert(contentDrafts).values({ tenantId, channel: 'social', platform: 'facebook', body: 'approved', status: 'approved' }).returning({ id: contentDrafts.id });
    const [p] = await tx.insert(contentDrafts).values({ tenantId, channel: 'social', platform: 'facebook', body: 'pending', status: 'pending_approval' }).returning({ id: contentDrafts.id });
    await tx.insert(platformConnections).values({ tenantId, platform: 'facebook' }); // api_publish_enabled defaults false
    return { approvedDraft: a!.id, pendingDraft: p!.id };
  });
  return { tenantId, ...ids };
}

async function schedule(tenantId: string, draftId: string, armed = false): Promise<string> {
  const res = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/calendar`, headers: { 'x-dev-user': OWNER }, payload: { draftId, type: 'social_post', platform: 'facebook', scheduledAt: tomorrow(), armed } });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

describe('OPS scheduler (Tasks 5.1–5.2)', () => {
  it('schedules an approved post and refuses an unapproved one', async () => {
    const { tenantId, approvedDraft, pendingDraft } = await seed();
    await schedule(tenantId, approvedDraft);
    const bad = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/calendar`, headers: { 'x-dev-user': OWNER }, payload: { draftId: pendingDraft, type: 'social_post', platform: 'facebook', scheduledAt: tomorrow() } });
    expect(bad.statusCode).toBe(409);
    const cal = await app.inject({ method: 'GET', url: `/tenants/${tenantId}/calendar`, headers: { 'x-dev-user': OWNER } });
    expect(cal.json().schedules.length).toBe(1);
  });

  it('fires a reminder (pending -> reminded)', async () => {
    const { tenantId, approvedDraft } = await seed();
    const scheduleId = await schedule(tenantId, approvedDraft);
    const r = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/schedules/${scheduleId}/remind`, headers: { 'x-dev-user': OWNER } });
    expect(r.json().reminded).toBe(true);
  });

  it('NEVER executes without arm + permission check', async () => {
    const { tenantId, approvedDraft } = await seed();
    const scheduleId = await schedule(tenantId, approvedDraft, false);

    // unarmed -> blocked
    const unarmed = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/schedules/${scheduleId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(unarmed.json()).toMatchObject({ executed: false, blocked: true });
    expect(unarmed.json().reason).toContain('not armed');

    // armed but API disabled -> still blocked
    await app.inject({ method: 'POST', url: `/tenants/${tenantId}/schedules/${scheduleId}/arm`, headers: { 'x-dev-user': OWNER } });
    const noApi = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/schedules/${scheduleId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(noApi.json().blocked).toBe(true);
    expect(noApi.json().reason).toContain('api');

    // enable API + armed -> passes the gate, reaches the adapter (scaffold, not executed)
    await db.withTenant(tenantId, (tx) => tx.update(platformConnections).set({ apiPublishEnabled: true }).where(and(eq(platformConnections.tenantId, tenantId), eq(platformConnections.platform, 'facebook'))));
    const permitted = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/schedules/${scheduleId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(permitted.json().blocked).toBe(false); // permission gate passed
    expect(permitted.json().executed).toBe(false); // API adapter is a Phase-8 scaffold
    expect(permitted.json().reason.toLowerCase()).toContain('scaffold');
  });

  it('requires auth (401) and membership (403)', async () => {
    const { tenantId } = await seed();
    expect((await app.inject({ method: 'GET', url: `/tenants/${tenantId}/calendar` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/tenants/${tenantId}/calendar`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

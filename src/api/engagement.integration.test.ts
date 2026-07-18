import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { tenantProfiles } from '../db/schema/tenants.js';
import { platformConnections } from '../db/schema/platform-connections.js';
import { engagementItems } from '../db/schema/engagement-items.js';
import { approvalQueue } from '../db/schema/approval-queue.js';
import { systemEvents } from '../db/schema/system-events.js';

const transport: LlmTransport = async () => ({ text: 'Thanks so much for reaching out! We appreciate you.', usage: { promptTokens: 1, completionTokens: 1 }, model: 'test' });

const OWNER = 'user_owner';
let app: FastifyInstance;
let db: Db;
const created: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({ config: loadConfig(), db, research: { llm: new LlmClient({ transport, sleep: async () => {} }), search: new FixtureSearchProvider({}), models: { fast: 'f', balanced: 'b', deep: 'd' } } });
  await app.ready();
});

afterAll(async () => {
  for (const id of created) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function seed(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Aurora' } });
  const id = res.json().id as string;
  created.push(id);
  await db.withTenant(id, async (tx) => {
    await tx.insert(tenantProfiles).values({ tenantId: id, voice: 'warm' });
    await tx.insert(platformConnections).values({ tenantId: id, platform: 'facebook' }); // reply flags default false
  });
  return id;
}

async function draft(id: string, type: 'comment' | 'message', inboundText: string) {
  const res = await app.inject({ method: 'POST', url: `/tenants/${id}/engagement/draft`, headers: { 'x-dev-user': OWNER }, payload: { type, platform: 'facebook', inboundText } });
  expect(res.statusCode).toBe(200);
  return res.json() as { itemId: string; approvalId: string };
}

async function setFlags(id: string, flags: Partial<{ apiReplyEnabled: boolean; apiDmReplyEnabled: boolean }>) {
  await db.withTenant(id, (tx) => tx.update(platformConnections).set(flags).where(and(eq(platformConnections.tenantId, id), eq(platformConnections.platform, 'facebook'))));
}

describe('OPS engagement — comments + DMs (Tasks 6.1–6.3)', () => {
  it('drafts require approval; DMs are privacy-flagged and PII-redacted in events', async () => {
    const id = await seed();
    const c = await draft(id, 'comment', 'Love this place!');
    const m = await draft(id, 'message', 'Call me at john@example.com or 555-123-4567');

    const items = await db.withTenant(id, (tx) => tx.select().from(engagementItems).where(eq(engagementItems.tenantId, id)));
    expect(items.every((i) => i.status === 'pending_approval')).toBe(true);
    expect(items.find((i) => i.type === 'message')!.privacyFlag).toBe(true);

    // both are HIGH-risk approvals in the inbox
    const approvals = await db.withTenant(id, (tx) => tx.select().from(approvalQueue).where(eq(approvalQueue.tenantId, id)));
    expect(approvals.every((a) => a.risk === 'HIGH')).toBe(true);
    expect(approvals.map((a) => a.kind).sort()).toEqual(['comment', 'message']);

    // the DM's inbound PII does not appear in the event payload
    const evts = await db.adminPool.query("SELECT payload::text AS p FROM system_events WHERE tenant_id = $1 AND action = 'engagement.reply_drafted'", [id]);
    for (const row of evts.rows) expect(row.p).not.toContain('john@example.com');
    void c; void m;
  });

  it('cannot send without approval, and DM toggle is independent of comment toggle', async () => {
    const id = await seed();
    const c = await draft(id, 'comment', 'Question about hours?');

    // before approval -> blocked
    const early = await app.inject({ method: 'POST', url: `/tenants/${id}/engagement/${c.itemId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(early.json()).toMatchObject({ blocked: true });

    // approve it
    await app.inject({ method: 'POST', url: `/tenants/${id}/approvals/${c.approvalId}/decide`, headers: { 'x-dev-user': OWNER }, payload: { decision: 'approve' } });

    // approved but api_reply_enabled off -> blocked
    const noFlag = await app.inject({ method: 'POST', url: `/tenants/${id}/engagement/${c.itemId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(noFlag.json().blocked).toBe(true);

    // enable ONLY comment replies
    await setFlags(id, { apiReplyEnabled: true, apiDmReplyEnabled: false });
    const commentOk = await app.inject({ method: 'POST', url: `/tenants/${id}/engagement/${c.itemId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(commentOk.json().blocked).toBe(false); // comment gate passed
    expect(commentOk.json().executed).toBe(false); // adapter scaffold (Phase 8)

    // a DM, approved, must STILL be blocked because the DM toggle is off
    const m = await draft(id, 'message', 'Hi there');
    const dmApproval = await db.withTenant(id, (tx) => tx.select().from(approvalQueue).where(and(eq(approvalQueue.resourceId, m.itemId))));
    await app.inject({ method: 'POST', url: `/tenants/${id}/approvals/${dmApproval[0]!.id}/decide`, headers: { 'x-dev-user': OWNER }, payload: { decision: 'approve' } });
    const dmBlocked = await app.inject({ method: 'POST', url: `/tenants/${id}/engagement/${m.itemId}/execute`, headers: { 'x-dev-user': OWNER } });
    expect(dmBlocked.json().blocked).toBe(true); // comment-enabled does NOT enable DMs
  });

  it('requires auth (401) and membership (403)', async () => {
    const id = await seed();
    expect((await app.inject({ method: 'GET', url: `/tenants/${id}/engagement` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/tenants/${id}/engagement`, headers: { 'x-dev-user': 'stranger' } })).statusCode).toBe(403);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../../config/env.js';
import { createDb, type Db } from '../../db/client.js';
import { tenants } from '../../db/schema/tenants.js';
import { postMetrics } from '../../db/schema/post-metrics.js';
import { resolveAdapter } from '../registry.js';
import { makeFacebookAdapter } from './facebook.js';
import { makeTwitterAdapter } from './twitter.js';
import { addSuppression, isSuppressed, importContacts } from './suppression.js';
import { sendEmail, buildEmailHtml, type EmailProvider } from './email.js';
import { verifyWebhookSignature, processEmailWebhook } from './webhook.js';
import { signUnsubscribe, verifyUnsubscribe } from './unsubscribe.js';
import type { EmailCredentials } from '../../credentials/schemas/email.js';

const creds: EmailCredentials = { provider: 'resend', apiKey: 'k', fromAddress: 'hi@aurora.coffee', fromName: 'Aurora', physicalAddress: '1 Bean St, Coffeeville', webhookSecret: 'whsec_123' };

let db: Db;
const T = randomUUID();

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => { await tx.insert(tenants).values({ id: T, name: 'Aurora' }); });
});
afterAll(async () => {
  await db.adminPool.query('DELETE FROM post_metrics WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM published_items WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM email_suppressions WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('API adapter scaffolds (Tasks 8.1–8.2)', () => {
  it('facebook/twitter validate credentials and are unhealthy scaffolds', async () => {
    const fb = makeFacebookAdapter();
    expect((await fb.validateCredentials({ pageId: '1', accessToken: 't' })).valid).toBe(true);
    expect((await fb.validateCredentials({ pageId: '1' })).valid).toBe(false);
    expect((await fb.healthCheck('t')).healthy).toBe(false);
    await expect(fb.publishPost!({ draftId: 'd' })).rejects.toThrow();
    expect(makeTwitterAdapter().platform).toBe('twitter');
  });

  it('resolveAdapter routes api mode to the real per-platform adapters', () => {
    const a = resolveAdapter('facebook', { publishMode: 'api', apiPublishEnabled: true, browserPublishEnabled: false });
    expect(a.platform).toBe('facebook');
    expect(a.mode).toBe('api');
  });
});

describe('Email compliance (Task 8.3, design §21)', () => {
  it('the send gate REFUSES suppressed recipients', async () => {
    await addSuppression(db, T, 'bounced@x.com', 'hard_bounce');
    expect(await isSuppressed(db, T, 'bounced@x.com')).toBe(true);
    const res = await sendEmail({ db }, T, { to: 'bounced@x.com', subject: 's', body: 'b', creds, unsubscribe: { baseUrl: 'https://app.test', secret: 'unsub-secret' } });
    expect(res).toMatchObject({ sent: false, blocked: true });
  });

  it('injects an unsubscribe link + physical address footer', () => {
    const html = buildEmailHtml('Hello', creds, 'https://aurora.coffee/unsub');
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('1 Bean St, Coffeeville');
    expect(html).toContain('https://aurora.coffee/unsub');
  });

  it('sends via the provider and creates a published_items anchor', async () => {
    const provider: EmailProvider = async () => ({ messageId: 'msg-1' });
    const res = await sendEmail({ db, provider }, T, { to: 'ok@x.com', subject: 's', body: 'b', creds, unsubscribe: { baseUrl: 'https://app.test', secret: 'unsub-secret' } });
    expect(res.sent).toBe(true);
    expect(res.messageId).toBe('msg-1');
    expect(res.publishedItemId).toBeDefined();
  });

  it('list import requires a consent attestation and skips suppressed', async () => {
    await expect(importContacts(db, T, { emails: ['a@x.com'], consentConfirmed: false })).rejects.toThrow(/consent/);
    const r = await importContacts(db, T, { emails: ['a@x.com', 'bounced@x.com'], consentConfirmed: true });
    expect(r.imported).toBe(1); // bounced@x.com already suppressed
    expect(r.suppressed).toBe(1);
  });
});

describe('Email webhooks (Task 8.3b)', () => {
  it('verifies HMAC signatures (rejects tampered)', () => {
    const body = JSON.stringify({ events: [] });
    const sig = createHmac('sha256', 'whsec_123').update(body).digest('hex');
    expect(verifyWebhookSignature(body, 'whsec_123', sig)).toBe(true);
    expect(verifyWebhookSignature(body, 'whsec_123', 'deadbeef')).toBe(false);
  });

  it('unsubscribe tokens are HMAC-signed and email/tenant-bound', () => {
    const secret = 'unsub-secret';
    const sig = signUnsubscribe(T, 'user@x.com', secret);
    expect(verifyUnsubscribe(T, 'user@x.com', sig, secret)).toBe(true);
    expect(verifyUnsubscribe(T, 'other@x.com', sig, secret)).toBe(false); // can't reuse for a different address
    expect(verifyUnsubscribe(randomUUID(), 'user@x.com', sig, secret)).toBe(false); // or a different tenant
    expect(verifyUnsubscribe(T, 'user@x.com', 'forged', secret)).toBe(false);
  });

  it('maps events to metrics and auto-suppresses hard bounces + complaints', async () => {
    // msg-1 was published above
    const events = [
      { messageId: 'msg-1', event: 'open' as const, email: 'ok@x.com' },
      { messageId: 'msg-1', event: 'bounce' as const, email: 'newbounce@x.com' },
      { messageId: 'msg-1', event: 'spamreport' as const, email: 'complainer@x.com' },
    ];
    const r = await processEmailWebhook(db, T, events);
    expect(r.processed).toBeGreaterThanOrEqual(2); // open + bounce recorded
    expect(r.suppressed).toBe(2); // bounce + complaint
    expect(await isSuppressed(db, T, 'newbounce@x.com')).toBe(true);
    expect(await isSuppressed(db, T, 'complainer@x.com')).toBe(true);
    const metrics = await db.withTenant(T, (tx) => tx.select().from(postMetrics).where(eq(postMetrics.tenantId, T)));
    expect(metrics.length).toBeGreaterThanOrEqual(2);
  });
});

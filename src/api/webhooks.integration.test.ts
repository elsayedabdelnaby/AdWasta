import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { deriveUnsubscribeSecret, signUnsubscribe } from '../adapters/api/unsubscribe.js';

const OWNER = 'user_owner';
const WEBHOOK_SECRET = 'whsec_test_123';
const UNSUB_SECRET = deriveUnsubscribeSecret(loadConfig().CREDENTIALS_MASTER_KEY);
let app: FastifyInstance;
let db: Db;
const created: string[] = [];

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

async function seedTenantWithEmailCreds(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'Aurora' } });
  const id = res.json().id as string;
  created.push(id);
  await app.inject({ method: 'PATCH', url: `/tenants/${id}/platforms/email`, headers: { 'x-dev-user': OWNER }, payload: { apiEmailEnabled: true } });
  const save = await app.inject({
    method: 'POST',
    url: `/tenants/${id}/platforms/email/credentials`,
    headers: { 'x-dev-user': OWNER },
    payload: { provider: 'resend', apiKey: 'k', fromAddress: 'hi@aurora.coffee', physicalAddress: '1 Bean St', webhookSecret: WEBHOOK_SECRET },
  });
  expect(save.statusCode).toBe(200);
  return id;
}

function postWebhook(id: string, raw: string, sig?: string) {
  return app.inject({
    method: 'POST',
    url: `/webhooks/email/${id}`,
    headers: { 'content-type': 'application/json', ...(sig ? { 'x-webhook-signature': sig } : {}) },
    payload: raw,
  });
}

describe('Email webhook route — raw-body signature (Task 8.3b)', () => {
  it('rejects an unsigned / mis-signed webhook (401)', async () => {
    const id = await seedTenantWithEmailCreds();
    const raw = JSON.stringify({ events: [] });
    expect((await postWebhook(id, raw)).statusCode).toBe(401);
    expect((await postWebhook(id, raw, 'deadbeef')).statusCode).toBe(401);
  });

  it('accepts a webhook signed over the exact raw bytes', async () => {
    const id = await seedTenantWithEmailCreds();
    const raw = JSON.stringify({ events: [] });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const ok = await postWebhook(id, raw, sig);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ok).toBe(true);
  });

  it('401s when the tenant has no webhook secret configured', async () => {
    const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'NoCreds' } });
    const id = res.json().id as string;
    created.push(id);
    expect((await postWebhook(id, JSON.stringify({ events: [] }), 'x')).statusCode).toBe(401);
  });
});

describe('Signed unsubscribe route (design §21)', () => {
  it('suppresses only with a valid signed token; forged tokens are rejected', async () => {
    const id = await seedTenantWithEmailCreds();
    const email = 'reader@x.com';
    const sig = signUnsubscribe(id, email, UNSUB_SECRET);

    const forged = await app.inject({ method: 'GET', url: `/unsubscribe/${id}?email=${encodeURIComponent(email)}&sig=forged` });
    expect(forged.statusCode).toBe(401);

    const ok = await app.inject({ method: 'GET', url: `/unsubscribe/${id}?email=${encodeURIComponent(email)}&sig=${sig}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().unsubscribed).toBe(true);

    // token for one address can't suppress a different one
    const abuse = await app.inject({ method: 'GET', url: `/unsubscribe/${id}?email=${encodeURIComponent('victim@x.com')}&sig=${sig}` });
    expect(abuse.statusCode).toBe(401);
  });
});

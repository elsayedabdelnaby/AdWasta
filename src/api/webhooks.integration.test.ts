import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';

const OWNER = 'user_owner';
const WEBHOOK_SECRET = 'whsec_test_123';
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
  // Enable API + save email credentials (design §21 gate: enable -> creds -> health)
  await app.inject({ method: 'PATCH', url: `/tenants/${id}/platforms/email`, headers: { 'x-dev-user': OWNER }, payload: { apiEmailEnabled: true } });
  const save = await app.inject({
    method: 'POST',
    url: `/tenants/${id}/platforms/email/credentials`,
    headers: { 'x-dev-user': OWNER },
    payload: { provider: 'resend', apiKey: 'k', fromAddress: 'hi@aurora.coffee', physicalAddress: '1 Bean St', webhookSecret: WEBHOOK_SECRET },
  });
  expect(save.statusCode).toBe(200);
  expect(save.json().saved).toBe(true);
  return id;
}

describe('Email webhook route (Task 8.3b — signature-gated, public)', () => {
  it('rejects an unsigned / mis-signed webhook (401)', async () => {
    const id = await seedTenantWithEmailCreds();
    const body = { events: [] };
    const unsigned = await app.inject({ method: 'POST', url: `/webhooks/email/${id}`, payload: body });
    expect(unsigned.statusCode).toBe(401);
    const badSig = await app.inject({ method: 'POST', url: `/webhooks/email/${id}`, headers: { 'x-webhook-signature': 'deadbeef' }, payload: body });
    expect(badSig.statusCode).toBe(401);
  });

  it('accepts a correctly-signed webhook', async () => {
    const id = await seedTenantWithEmailCreds();
    const body = { events: [] };
    const raw = JSON.stringify(body);
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const ok = await app.inject({ method: 'POST', url: `/webhooks/email/${id}`, headers: { 'x-webhook-signature': sig }, payload: body });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ok).toBe(true);
  });

  it('returns 401 when the tenant has no webhook secret configured', async () => {
    const res = await app.inject({ method: 'POST', url: '/tenants', headers: { 'x-dev-user': OWNER }, payload: { name: 'NoCreds' } });
    const id = res.json().id as string;
    created.push(id);
    const r = await app.inject({ method: 'POST', url: `/webhooks/email/${id}`, headers: { 'x-webhook-signature': 'x' }, payload: { events: [] } });
    expect(r.statusCode).toBe(401);
  });
});

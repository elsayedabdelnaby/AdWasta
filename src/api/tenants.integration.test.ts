import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';

let app: FastifyInstance;
let db: Db;
const createdTenants: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({ config: loadConfig(), db }); // no sessionProvider => dev provider
  await app.ready();
});

afterAll(async () => {
  for (const id of createdTenants) {
    await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  }
  await app.close();
  await db.close();
});

async function createTenant(userId: string, name = 'Acme'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/tenants',
    headers: { 'x-dev-user': userId },
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  const id = res.json().id as string;
  createdTenants.push(id);
  return id;
}

describe('Auth gate (ADR-002 — the Phase 0 gate)', () => {
  it('an unauthenticated request to a tenant route returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/tenants/${randomUUID()}` });
    expect(res.statusCode).toBe(401);
  });

  it('an authenticated non-member of :id returns 403', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}`,
      headers: { 'x-dev-user': STRANGER },
    });
    expect(res.statusCode).toBe(403);
  });

  it('the creator (a member) can read the tenant → 200', async () => {
    const id = await createTenant(OWNER, 'Aurora Coffee');
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Aurora Coffee');
  });

  it('POST /tenants requires authentication (401 without a session)', async () => {
    const res = await app.inject({ method: 'POST', url: '/tenants', payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('Tenant CRUD + onboard (Task 0.3)', () => {
  it('creating a tenant makes the caller its owner (membership persisted)', async () => {
    const id = await createTenant(OWNER);
    // owner sees it, a stranger does not (403) — proves membership drives access
    const asOwner = await app.inject({
      method: 'GET',
      url: `/tenants/${id}`,
      headers: { 'x-dev-user': OWNER },
    });
    const asStranger = await app.inject({
      method: 'GET',
      url: `/tenants/${id}`,
      headers: { 'x-dev-user': STRANGER },
    });
    expect(asOwner.statusCode).toBe(200);
    expect(asStranger.statusCode).toBe(403);
  });

  it('onboard validates the profile and persists it (member only)', async () => {
    const id = await createTenant(OWNER);
    const good = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: {
        description: 'Specialty coffee roaster',
        audience: 'Local cafe-goers',
        goals: ['awareness', 'foot traffic'],
        voice: 'warm, unpretentious',
        competitors: ['Blue Bottle'],
        platforms: ['facebook', 'email'],
      },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().tenantId).toBe(id);

    // invalid body (goals not an array) → 400
    const bad = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: { goals: 'not-an-array' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('onboard is refused for non-members (403) and anonymous (401)', async () => {
    const id = await createTenant(OWNER);
    const anon = await app.inject({ method: 'POST', url: `/tenants/${id}/onboard`, payload: {} });
    expect(anon.statusCode).toBe(401);
    const stranger = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': STRANGER },
      payload: { description: 'x' },
    });
    expect(stranger.statusCode).toBe(403);
  });
});

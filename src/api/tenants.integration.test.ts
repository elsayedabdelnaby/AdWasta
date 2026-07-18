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

  it('onboard persists website and social page urls (fed to research context)', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: {
        description: 'Specialty coffee roaster',
        website: 'https://aurora.coffee',
        socialUrls: {
          facebook: 'https://facebook.com/auroracoffee',
          instagram: 'https://instagram.com/auroracoffee',
        },
      },
    });
    expect(res.statusCode).toBe(200);

    const { rows } = await db.adminPool.query(
      'SELECT website, social_urls FROM tenant_profiles WHERE tenant_id = $1',
      [id],
    );
    expect(rows[0].website).toBe('https://aurora.coffee');
    expect(rows[0].social_urls).toEqual({
      facebook: 'https://facebook.com/auroracoffee',
      instagram: 'https://instagram.com/auroracoffee',
    });
  });

  it('onboard rejects a malformed website or social url (400)', async () => {
    const id = await createTenant(OWNER);
    const badSite = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: { website: 'not-a-url' },
    });
    expect(badSite.statusCode).toBe(400);

    const badSocial = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: { socialUrls: { facebook: 'auroracoffee' } },
    });
    expect(badSocial.statusCode).toBe(400);
  });

  it('GET profile returns the saved onboarding data (form prefill)', async () => {
    const id = await createTenant(OWNER);
    await app.inject({
      method: 'POST',
      url: `/tenants/${id}/onboard`,
      headers: { 'x-dev-user': OWNER },
      payload: {
        description: 'Handcrafted mihrab decor',
        audience: 'mosques',
        goals: ['awareness'],
        platforms: ['facebook'],
        website: 'https://mehrab-alquran.com',
        socialUrls: { facebook: 'https://facebook.com/mehrab.alquran' },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/profile`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.description).toBe('Handcrafted mihrab decor');
    expect(body.audience).toBe('mosques');
    expect(body.goals).toEqual(['awareness']);
    expect(body.platforms).toEqual(['facebook']);
    expect(body.website).toBe('https://mehrab-alquran.com');
    expect(body.socialUrls).toEqual({ facebook: 'https://facebook.com/mehrab.alquran' });
    expect(body.logo).toBeUndefined(); // never ship the image bytes as JSON
  });

  it('GET profile returns an empty object before onboarding', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/profile`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
  });

  it('GET profile is refused for non-members (403) and anonymous (401)', async () => {
    const id = await createTenant(OWNER);
    const anon = await app.inject({ method: 'GET', url: `/tenants/${id}/profile` });
    expect(anon.statusCode).toBe(401);
    const stranger = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/profile`,
      headers: { 'x-dev-user': STRANGER },
    });
    expect(stranger.statusCode).toBe(403);
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

describe('Tenant logo', () => {
  // 1x1 transparent PNG
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('uploads a png and serves it back with the same bytes and content-type', async () => {
    const id = await createTenant(OWNER);
    const up = await app.inject({
      method: 'PUT',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': OWNER, 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(up.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.rawPayload.equals(PNG)).toBe(true);
  });

  it('404s when no logo is set', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-image content type (415)', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'PUT',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': OWNER, 'content-type': 'text/plain' },
      payload: 'not an image',
    });
    expect(res.statusCode).toBe(415);
  });

  it('rejects an oversized upload (413)', async () => {
    const id = await createTenant(OWNER);
    const res = await app.inject({
      method: 'PUT',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': OWNER, 'content-type': 'image/png' },
      payload: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    expect(res.statusCode).toBe(413);
  });

  it('logo routes are refused for non-members (403) and anonymous (401)', async () => {
    const id = await createTenant(OWNER);
    const anon = await app.inject({
      method: 'PUT',
      url: `/tenants/${id}/logo`,
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(anon.statusCode).toBe(401);
    const stranger = await app.inject({
      method: 'PUT',
      url: `/tenants/${id}/logo`,
      headers: { 'x-dev-user': STRANGER, 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(stranger.statusCode).toBe(403);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { EnvKeyProvider } from '../credentials/key-provider.js';
import { Vault } from '../credentials/vault.js';

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';
let app: FastifyInstance;
let db: Db;
let vault: Vault;
const createdTenants: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  vault = new Vault(db, new EnvKeyProvider(loadConfig().CREDENTIALS_MASTER_KEY));
  app = await buildApp({ config: loadConfig(), db, vault });
  await app.ready();
});

afterAll(async () => {
  for (const id of createdTenants) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function newTenant(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/tenants',
    headers: { 'x-dev-user': OWNER },
    payload: { name: 'Aurora' },
  });
  const id = res.json().id as string;
  createdTenants.push(id);
  return id;
}

describe('Platform settings API (Task 0.5)', () => {
  it('PATCH updates flags and returns credential_requirements when api_publish is enabled', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tenants/${id}/platforms/facebook`,
      headers: { 'x-dev-user': OWNER },
      payload: { publishMode: 'api', apiPublishEnabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connection.publishMode).toBe('api');
    expect(body.connection.apiPublishEnabled).toBe(true);
    expect(body.credentialRequirements.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'accessToken', secret: true })]),
    );
  });

  it('rejects the reserved browser publish mode (ADR-001)', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tenants/${id}/platforms/facebook`,
      headers: { 'x-dev-user': OWNER },
      payload: { publishMode: 'browser' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an attempt to set the reserved browser_publish_enabled flag (ADR-001)', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tenants/${id}/platforms/facebook`,
      headers: { 'x-dev-user': OWNER },
      payload: { browserPublishEnabled: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth (401) and membership (403)', async () => {
    const id = await newTenant();
    const anon = await app.inject({
      method: 'PATCH',
      url: `/tenants/${id}/platforms/facebook`,
      payload: { apiPublishEnabled: true },
    });
    expect(anon.statusCode).toBe(401);
    const stranger = await app.inject({
      method: 'PATCH',
      url: `/tenants/${id}/platforms/facebook`,
      headers: { 'x-dev-user': STRANGER },
      payload: { apiPublishEnabled: true },
    });
    expect(stranger.statusCode).toBe(403);
  });

  it('saves valid credentials (encrypted) and runs the health-check stub', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/platforms/facebook/credentials`,
      headers: { 'x-dev-user': OWNER },
      payload: { pageId: '12345', accessToken: 'SECRET-TOKEN-abc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().saved).toBe(true);
    expect(res.json().health).toHaveProperty('healthy');

    // stored + retrievable via the vault, and the secret is not in any event payload
    expect(await vault.getCredentials(id, 'facebook')).toEqual({
      pageId: '12345',
      accessToken: 'SECRET-TOKEN-abc',
    });
    const events = await db.adminPool.query(
      "SELECT payload::text AS p FROM system_events WHERE tenant_id = $1 AND action = 'credential.saved'",
      [id],
    );
    for (const row of events.rows) expect(row.p).not.toContain('SECRET-TOKEN-abc');
  });

  it('rejects invalid credentials with 400', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/platforms/facebook/credentials`,
      headers: { 'x-dev-user': OWNER },
      payload: { pageId: '12345' }, // missing accessToken
    });
    expect(res.statusCode).toBe(400);
  });
});

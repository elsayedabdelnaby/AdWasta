import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { startTrace } from '../observability/trace.js';

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';
let app: FastifyInstance;
let db: Db;
const createdTenants: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({ config: loadConfig(), db });
  await app.ready();
});

afterAll(async () => {
  for (const id of createdTenants) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function newTenantWithActivity(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/tenants',
    headers: { 'x-dev-user': OWNER },
    payload: { name: 'Obs' },
  });
  const id = res.json().id as string;
  createdTenants.push(id);
  await app.inject({
    method: 'POST',
    url: `/tenants/${id}/onboard`,
    headers: { 'x-dev-user': OWNER },
    payload: { description: 'coffee' },
  });
  return id;
}

describe('Activity + audit APIs (Task 0.8)', () => {
  it('lists system_events for the tenant', async () => {
    const id = await newTenantWithActivity();
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/events`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(200);
    const actions = res.json().events.map((e: { action: string }) => e.action);
    expect(actions).toContain('tenant.created');
    expect(actions).toContain('tenant.onboarded');
  });

  it('filters events by category', async () => {
    const id = await newTenantWithActivity();
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/events?category=tenant`,
      headers: { 'x-dev-user': OWNER },
    });
    const cats = res.json().events.map((e: { category: string }) => e.category);
    expect(cats.length).toBeGreaterThan(0);
    expect(new Set(cats)).toEqual(new Set(['tenant']));
  });

  it('lists the audit log (tenant.created is a compliance event)', async () => {
    const id = await newTenantWithActivity();
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/audit`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(res.statusCode).toBe(200);
    const actions = res.json().audit.map((e: { action: string }) => e.action);
    expect(actions).toContain('tenant.created');
  });

  it('events + audit require membership (403) and auth (401)', async () => {
    const id = await newTenantWithActivity();
    expect((await app.inject({ method: 'GET', url: `/tenants/${id}/events` })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/tenants/${id}/events`,
          headers: { 'x-dev-user': STRANGER },
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('Trace APIs (Task 0.8)', () => {
  it('lists traces for a tenant and returns detail via /traces/:id', async () => {
    const id = await newTenantWithActivity();
    const trace = await startTrace(db, id, { arm: 'market', crew: 'alex' });
    await trace.addStep({ action: 'llm.call', costUsd: 0.01, latencyMs: 100 });
    await trace.finish('completed');

    const list = await app.inject({
      method: 'GET',
      url: `/tenants/${id}/traces`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().traces.map((t: { id: string }) => t.id)).toContain(trace.traceId);

    const detail = await app.inject({
      method: 'GET',
      url: `/traces/${trace.traceId}`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().steps).toHaveLength(1);
  });

  it('a non-member cannot read a trace (404)', async () => {
    const id = await newTenantWithActivity();
    const trace = await startTrace(db, id, { arm: 'market' });
    const res = await app.inject({
      method: 'GET',
      url: `/traces/${trace.traceId}`,
      headers: { 'x-dev-user': STRANGER },
    });
    expect(res.statusCode).toBe(404);
  });
});

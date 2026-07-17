import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';

const OWNER = 'user_owner';
const MAX = 5;
let app: FastifyInstance;
let db: Db;
const createdTenants: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({
    config: loadConfig(),
    db,
    rateLimit: { max: MAX, timeWindow: '1 minute' },
  });
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
    payload: { name: 'RL' },
  });
  const id = res.json().id as string;
  createdTenants.push(id);
  return id;
}

describe('Per-tenant rate limit (Phase 0 gate, ADR-002)', () => {
  it('trips (429) under load for one tenant without affecting another', async () => {
    const a = await newTenant();
    const b = await newTenant();

    const statuses: number[] = [];
    for (let i = 0; i < MAX + 1; i++) {
      const res = await app.inject({
        method: 'GET',
        url: `/tenants/${a}`,
        headers: { 'x-dev-user': OWNER },
      });
      statuses.push(res.statusCode);
    }
    // first MAX succeed, the next is throttled
    expect(statuses[0]).toBe(200);
    expect(statuses[MAX]).toBe(429);

    // a different tenant has its own bucket — not throttled
    const other = await app.inject({
      method: 'GET',
      url: `/tenants/${b}`,
      headers: { 'x-dev-user': OWNER },
    });
    expect(other.statusCode).toBe(200);
  });
});

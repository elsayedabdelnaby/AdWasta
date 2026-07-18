import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';

let app: FastifyInstance;
let db: Db;

beforeAll(async () => {
  db = createDb(loadConfig());
  app = await buildApp({ config: loadConfig(), db }); // default CORS_ORIGINS includes localhost:8080
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('CORS is restricted to a first-party allowlist (no credentialed wildcard)', () => {
  it('reflects an allowed origin with credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:8080' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does NOT reflect an arbitrary/disallowed origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

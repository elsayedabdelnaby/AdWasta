import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { createArmQueue, createRedis } from '../queue/jobs.js';

let app: FastifyInstance;
let db: Db;
let redis: IORedis;
let queue: Queue;

beforeAll(async () => {
  db = createDb(loadConfig());
  redis = createRedis(loadConfig().REDIS_URL);
  queue = createArmQueue(loadConfig().REDIS_URL, `test-health-${randomUUID()}`);
  app = await buildApp({ config: loadConfig(), db, redis, jobQueue: queue });
  await app.ready();
});

afterAll(async () => {
  await queue.obliterate({ force: true }).catch(() => {});
  await queue.close();
  await redis.quit();
  await app.close();
  await db.close();
});

describe('Health + readiness (Phase 0 gate, design §23)', () => {
  it('/healthz is public and reports liveness', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('/readyz reports Postgres, Redis, and queue depth', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.checks.postgres).toBe(true);
    expect(body.checks.redis).toBe(true);
    expect(body.checks.queue).toHaveProperty('waiting');
  });
});

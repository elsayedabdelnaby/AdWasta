import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { buildApp } from './app.js';
import { createArmQueue } from '../queue/jobs.js';
import { startArmWorker } from '../queue/workers.js';
import type { Queue, Worker } from 'bullmq';

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';
const queueName = `test-arm-jobs-${randomUUID()}`;

let app: FastifyInstance;
let db: Db;
let queue: Queue;
let worker: Worker;
const createdTenants: string[] = [];

beforeAll(async () => {
  db = createDb(loadConfig());
  queue = createArmQueue(loadConfig().REDIS_URL, queueName);
  worker = startArmWorker(db, loadConfig().REDIS_URL, queueName);
  app = await buildApp({ config: loadConfig(), db, jobQueue: queue });
  await app.ready();
});

afterAll(async () => {
  await worker.close();
  await queue.obliterate({ force: true }).catch(() => {});
  await queue.close();
  for (const id of createdTenants) await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  await app.close();
  await db.close();
});

async function newTenant(user = OWNER): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/tenants',
    headers: { 'x-dev-user': user },
    payload: { name: 'Jobs' },
  });
  const id = res.json().id as string;
  createdTenants.push(id);
  return id;
}

describe('Async job API (Task 0.7)', () => {
  it('enqueue → poll → completed stub', async () => {
    const id = await newTenant();
    const enq = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/jobs`,
      headers: { 'x-dev-user': OWNER },
      payload: { arm: 'market', input: { topic: 'coffee' } },
    });
    expect(enq.statusCode).toBe(202);
    const jobId = enq.json().id as string;

    let status = 'queued';
    let result: unknown = null;
    for (let i = 0; i < 100 && status !== 'completed'; i++) {
      const poll = await app.inject({
        method: 'GET',
        url: `/jobs/${jobId}`,
        headers: { 'x-dev-user': OWNER },
      });
      expect(poll.statusCode).toBe(200);
      status = poll.json().status;
      result = poll.json().result;
      if (status !== 'completed') await sleep(50);
    }
    expect(status).toBe('completed');
    expect(result).toMatchObject({ stub: true, arm: 'market' });
  });

  it('GET /jobs/:id requires auth (401)', async () => {
    const id = await newTenant();
    const enq = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/jobs`,
      headers: { 'x-dev-user': OWNER },
      payload: { arm: 'market' },
    });
    const jobId = enq.json().id as string;
    const res = await app.inject({ method: 'GET', url: `/jobs/${jobId}` });
    expect(res.statusCode).toBe(401);
  });

  it('a non-member cannot see another tenant’s job (404, no existence leak)', async () => {
    const id = await newTenant();
    const enq = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/jobs`,
      headers: { 'x-dev-user': OWNER },
      payload: { arm: 'market' },
    });
    const jobId = enq.json().id as string;
    const res = await app.inject({
      method: 'GET',
      url: `/jobs/${jobId}`,
      headers: { 'x-dev-user': STRANGER },
    });
    expect(res.statusCode).toBe(404);
  });

  it('enqueue requires membership (403 for non-member)', async () => {
    const id = await newTenant();
    const res = await app.inject({
      method: 'POST',
      url: `/tenants/${id}/jobs`,
      headers: { 'x-dev-user': STRANGER },
      payload: { arm: 'market' },
    });
    expect(res.statusCode).toBe(403);
  });
});

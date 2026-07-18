import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../config/env.js';
import { createDb, type Db } from '../../db/client.js';
import { tenants } from '../../db/schema/tenants.js';
import { intelSnapshots } from '../../db/schema/intel-snapshots.js';
import type { FeedFetchResult } from '../../tools/fetch-feed.js';
import { pollTrendSource, type TrendWatchDeps } from './watch.js';

let db: Db;
const T = randomUUID();
const SOURCE = 'https://feeds.example.com/coffee';

const UNCHANGED = 'Cold brew demand steady. Local roasters expand. Seasonal menu unchanged this week.';
const CHANGED = 'Breaking: nationwide oat milk shortage disrupts cafes and spikes alternative sourcing costs.';

function okFeed(contentText: string): FeedFetchResult {
  return { status: 'ok', httpStatus: 200, items: [{ title: contentText }], contentText };
}

async function snapshotCount(): Promise<number> {
  const r = await db.adminPool.query('SELECT count(*)::int AS n FROM intel_snapshots WHERE tenant_id = $1', [T]);
  return r.rows[0].n as number;
}

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Watch Tenant' });
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM intel_watermarks WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM intel_snapshots WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('Tier-0 trend watch (ADR-003 — hourly, NEVER an LLM)', () => {
  it('24 unchanged polls → zero Tier-1 escalations and zero snapshot rows; one change → exactly one', async () => {
    const onEscalate = vi.fn(async () => {});
    // freeze "now" so the 24h fallback never fires during the unchanged run
    const now = new Date('2026-07-18T00:00:00Z');
    const deps: TrendWatchDeps = {
      db,
      onEscalate,
      now: () => now,
      fetchFeed: async () => okFeed(UNCHANGED),
    };

    // first poll establishes the baseline (one escalation — the initial analysis)
    expect(await pollTrendSource(deps, T, SOURCE)).toBe('changed');
    expect(onEscalate).toHaveBeenCalledTimes(1);

    // 24 consecutive UNCHANGED polls
    for (let i = 0; i < 24; i++) {
      const outcome = await pollTrendSource(deps, T, SOURCE);
      expect(outcome).toBe('near_duplicate');
    }
    expect(onEscalate).toHaveBeenCalledTimes(1); // still 1 — no LLM work on unchanged
    expect(await snapshotCount()).toBe(0); // the watch never writes snapshots

    // one CHANGED poll → exactly one more escalation
    const changedDeps: TrendWatchDeps = { ...deps, fetchFeed: async () => okFeed(CHANGED) };
    expect(await pollTrendSource(changedDeps, T, SOURCE)).toBe('changed');
    expect(onEscalate).toHaveBeenCalledTimes(2);
  });

  it('a 304 Not-Modified poll escalates nothing when fresh', async () => {
    const src = 'https://feeds.example.com/news';
    const onEscalate = vi.fn(async () => {});
    const now = new Date('2026-07-18T00:00:00Z');
    // seed baseline
    await pollTrendSource({ db, onEscalate, now: () => now, fetchFeed: async () => okFeed('baseline content here') }, T, src);
    onEscalate.mockClear();

    const notModified: FeedFetchResult = { status: 'not_modified', httpStatus: 304, items: [], contentText: '' };
    const outcome = await pollTrendSource({ db, onEscalate, now: () => now, fetchFeed: async () => notModified }, T, src);
    expect(outcome).toBe('not_modified');
    expect(onEscalate).not.toHaveBeenCalled();
  });

  it('forces a Tier-1 run after 24h of no change (staleness SLA)', async () => {
    const src = 'https://feeds.example.com/stale';
    const onEscalate = vi.fn(async () => {});
    const t0 = new Date('2026-07-18T00:00:00Z');
    await pollTrendSource({ db, onEscalate, now: () => t0, fetchFeed: async () => okFeed('same old same old') }, T, src);
    onEscalate.mockClear();

    const t1 = new Date('2026-07-19T01:00:00Z'); // >24h later
    const outcome = await pollTrendSource(
      { db, onEscalate, now: () => t1, fetchFeed: async () => okFeed('same old same old') },
      T,
      src,
    );
    expect(outcome).toBe('stale_forced');
    expect(onEscalate).toHaveBeenCalledTimes(1);
  });
});

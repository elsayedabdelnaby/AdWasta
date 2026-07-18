import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { intelWatermarks } from '../../db/schema/intel-watermarks.js';
import { fetchFeed as realFetchFeed, type FeedFetchResult } from '../../tools/fetch-feed.js';
import { simhash, isNearDuplicate, NEAR_DUPLICATE_THRESHOLD } from '../../intel/fingerprint.js';

export type PollOutcome = 'not_modified' | 'near_duplicate' | 'changed' | 'stale_forced' | 'error';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrendWatchDeps {
  db: Db;
  /** Escalate to the Tier-1 LLM Trend arm. Injected so tests count escalations. */
  onEscalate: (args: { tenantId: string; source: string; contentText: string; reason: string }) => Promise<void>;
  fetchFeed?: (url: string, opts: { etag?: string; lastModified?: string }) => Promise<FeedFetchResult>;
  now?: () => Date;
  staleMs?: number;
  threshold?: number;
}

/**
 * Poll ONE trend source (ADR-003 Tier 0). Hourly, and it MUST NOT call an LLM —
 * this module imports no LLM client by design. Conditional GET + SimHash decide
 * whether anything materially changed; only a real diff (or the 24h staleness
 * fallback) escalates to the Tier-1 arm via onEscalate.
 */
export async function pollTrendSource(
  deps: TrendWatchDeps,
  tenantId: string,
  source: string,
): Promise<PollOutcome> {
  const now = deps.now?.() ?? new Date();
  const staleMs = deps.staleMs ?? DAY_MS;
  const threshold = deps.threshold ?? NEAR_DUPLICATE_THRESHOLD;
  const fetchFeed = deps.fetchFeed ?? ((url, opts) => realFetchFeed(url, opts));

  const wm = await deps.db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(intelWatermarks)
      .where(and(eq(intelWatermarks.tenantId, tenantId), eq(intelWatermarks.kind, 'trend'), eq(intelWatermarks.source, source)));
    return row ?? null;
  });

  const res = await fetchFeed(source, { etag: wm?.etag ?? undefined, lastModified: wm?.lastModified ?? undefined });
  if (res.status === 'error') return 'error';

  const stale = wm?.lastAnalyzedAt ? now.getTime() - wm.lastAnalyzedAt.getTime() > staleMs : true;

  // 304: content unchanged. Escalate only if the staleness SLA demands it.
  if (res.status === 'not_modified') {
    if (stale) {
      await markAnalyzed(deps.db, tenantId, source, wm?.fingerprint ?? null, res, now);
      await deps.onEscalate({ tenantId, source, contentText: '', reason: 'stale_24h' });
      return 'stale_forced';
    }
    await bumpSeen(deps.db, tenantId, source, res, now);
    return 'not_modified';
  }

  const fp = simhash(res.contentText);
  const nearDup = wm?.fingerprint ? isNearDuplicate(wm.fingerprint, fp, threshold) : false;

  if (nearDup && !stale) {
    await bumpSeen(deps.db, tenantId, source, res, now);
    return 'near_duplicate';
  }

  // First-ever, materially changed, or stale → record new fingerprint + escalate.
  await markAnalyzed(deps.db, tenantId, source, fp, res, now);
  await deps.onEscalate({
    tenantId,
    source,
    contentText: res.contentText,
    reason: stale && nearDup ? 'stale_24h' : 'changed',
  });
  return stale && nearDup ? 'stale_forced' : 'changed';
}

async function upsertWatermark(
  db: Db,
  tenantId: string,
  source: string,
  patch: Partial<typeof intelWatermarks.$inferInsert>,
): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    await tx
      .insert(intelWatermarks)
      .values({ tenantId, kind: 'trend', source, ...patch })
      .onConflictDoUpdate({
        target: [intelWatermarks.tenantId, intelWatermarks.kind, intelWatermarks.source],
        set: { ...patch, updatedAt: new Date() },
      });
  });
}

async function bumpSeen(db: Db, tenantId: string, source: string, res: FeedFetchResult, now: Date): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    const [wm] = await tx
      .select({ seenCount: intelWatermarks.seenCount })
      .from(intelWatermarks)
      .where(and(eq(intelWatermarks.tenantId, tenantId), eq(intelWatermarks.kind, 'trend'), eq(intelWatermarks.source, source)));
    await tx
      .insert(intelWatermarks)
      .values({ tenantId, kind: 'trend', source, seenCount: 1, lastSeenAt: now, etag: res.etag, lastModified: res.lastModified })
      .onConflictDoUpdate({
        target: [intelWatermarks.tenantId, intelWatermarks.kind, intelWatermarks.source],
        set: {
          seenCount: (wm?.seenCount ?? 1) + 1,
          lastSeenAt: now,
          ...(res.etag ? { etag: res.etag } : {}),
          ...(res.lastModified ? { lastModified: res.lastModified } : {}),
          updatedAt: new Date(),
        },
      });
  });
}

async function markAnalyzed(
  db: Db,
  tenantId: string,
  source: string,
  fingerprint: string | null,
  res: FeedFetchResult,
  now: Date,
): Promise<void> {
  await upsertWatermark(db, tenantId, source, {
    fingerprint: fingerprint ?? undefined,
    etag: res.etag,
    lastModified: res.lastModified,
    lastSeenAt: now,
    lastAnalyzedAt: now,
    seenCount: 1,
  });
}

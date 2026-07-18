import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { postMetrics } from '../db/schema/post-metrics.js';
import { publishedItems } from '../db/schema/approval-queue.js';
import { emitEvent } from '../observability/events.js';

export interface MetricInput {
  publishedItemId: string;
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  videoViews?: number;
  opens?: number;
  bounces?: number;
  unsubscribes?: number;
}

export interface ImportResult {
  imported: number;
  skipped: string[]; // publishedItemIds that don't exist for this tenant
}

/**
 * Import metric captures (design §12.2, Task 3.5.1). Every row MUST reference an
 * existing published_items row for this tenant (no anchor, no metrics) — rows
 * that don't are skipped, not silently attached.
 */
export async function importMetrics(db: Db, tenantId: string, rows: MetricInput[]): Promise<ImportResult> {
  if (rows.length === 0) return { imported: 0, skipped: [] };
  return db.withTenant(tenantId, async (tx) => {
    const ids = [...new Set(rows.map((r) => r.publishedItemId))];
    const existing = await tx.select({ id: publishedItems.id }).from(publishedItems).where(inArray(publishedItems.id, ids));
    const valid = new Set(existing.map((e) => e.id));

    const skipped: string[] = [];
    const toInsert = rows.filter((r) => {
      if (valid.has(r.publishedItemId)) return true;
      skipped.push(r.publishedItemId);
      return false;
    });

    if (toInsert.length > 0) {
      await tx.insert(postMetrics).values(toInsert.map((r) => ({ tenantId, ...r })));
      await emitEvent(tx, tenantId, {
        actorType: 'user',
        category: 'ops',
        action: 'metrics.imported',
        message: `imported ${toInsert.length} metric captures`,
        payload: { imported: toInsert.length, skipped: skipped.length },
      });
    }
    return { imported: toInsert.length, skipped };
  });
}

// Minimal CSV → MetricInput mapping (Meta Business Suite / X Analytics exports).
const COLUMN_MAP: Record<string, keyof MetricInput> = {
  published_item_id: 'publishedItemId',
  post_id: 'publishedItemId',
  impressions: 'impressions',
  reach: 'reach',
  likes: 'likes',
  reactions: 'likes',
  comments: 'comments',
  replies: 'comments',
  shares: 'shares',
  retweets: 'shares',
  clicks: 'clicks',
  link_clicks: 'clicks',
  saves: 'saves',
  bookmarks: 'saves',
  video_views: 'videoViews',
  opens: 'opens',
  bounces: 'bounces',
  unsubscribes: 'unsubscribes',
};

export function parseMetricsCsv(csv: string): MetricInput[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, unknown> = {};
    header.forEach((col, i) => {
      const field = COLUMN_MAP[col];
      if (!field) return;
      const raw = cells[i]?.trim() ?? '';
      if (field === 'publishedItemId') {
        row[field] = raw;
      } else if (raw !== '') {
        const num = Number(raw.replace(/,/g, '')); // tolerate thousands separators
        if (Number.isFinite(num)) row[field] = num; // drop non-numeric cells rather than store NaN
      }
    });
    return row as unknown as MetricInput;
  });
}

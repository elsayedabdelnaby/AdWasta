import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { publishedItems } from '../../db/schema/approval-queue.js';
import { postMetrics } from '../../db/schema/post-metrics.js';
import { emitEvent } from '../../observability/events.js';
import { addSuppression } from './suppression.js';
import type { EmailWebhookEvent } from './email.js';

/** HMAC-SHA256 over the raw body. (Providers sign exact bytes; the route passes the
 *  received raw string.) Constant-time compare; rejects unsigned/mismatched. */
export function verifyWebhookSignature(rawBody: string, secret: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const METRIC_FIELD: Record<string, keyof typeof postMetrics.$inferInsert> = {
  delivered: 'impressions',
  open: 'opens',
  click: 'clicks',
  bounce: 'bounces',
  unsubscribe: 'unsubscribes',
};

/**
 * Email metrics webhook (Task 8.3b, MEASURE Tier 2). Maps provider events to
 * post_metrics via the message id, and auto-appends hard bounces + spam complaints
 * to the suppression list. First fully-automated measured channel.
 */
export async function processEmailWebhook(db: Db, tenantId: string, events: EmailWebhookEvent[]): Promise<{ processed: number; suppressed: number }> {
  let processed = 0;
  await db.withTenant(tenantId, async (tx) => {
    for (const e of events) {
      const [item] = await tx.select({ id: publishedItems.id }).from(publishedItems).where(and(eq(publishedItems.tenantId, tenantId), eq(publishedItems.url, e.messageId)));
      if (!item) continue;
      const field = METRIC_FIELD[e.event];
      if (field) {
        await tx.insert(postMetrics).values({ tenantId, publishedItemId: item.id, [field]: 1 });
        processed += 1;
      }
    }
    await emitEvent(tx, tenantId, { actorType: 'adapter', category: 'measure', action: 'metrics.imported', message: `email webhook: ${processed} events`, payload: { processed } });
  });

  // Suppression side effects (bounce/complaint/unsubscribe) — auto, non-negotiable.
  let suppressed = 0;
  for (const e of events) {
    if (e.event === 'bounce') { await addSuppression(db, tenantId, e.email, 'hard_bounce'); suppressed += 1; }
    else if (e.event === 'spamreport') { await addSuppression(db, tenantId, e.email, 'complaint'); suppressed += 1; }
    else if (e.event === 'unsubscribe') { await addSuppression(db, tenantId, e.email, 'unsubscribe'); suppressed += 1; }
  }
  return { processed, suppressed };
}

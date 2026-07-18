import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { performanceInsights } from '../db/schema/performance-insights.js';

/**
 * A short "what worked" summary from the latest NON-PROVISIONAL insights, for
 * injection into Strategy + Content prompts (design §12.2 feedback loop). Groups
 * below the min sample are excluded (they are provisional) — the non-negotiable.
 * Capped to ~300 tokens.
 */
export async function loadPerformanceContext(db: Db, tenantId: string): Promise<string> {
  const insights = await db.withTenant(tenantId, (tx) =>
    tx
      .select({ kind: performanceInsights.kind, summary: performanceInsights.summary })
      .from(performanceInsights)
      .where(and(eq(performanceInsights.tenantId, tenantId), eq(performanceInsights.provisional, false)))
      .orderBy(desc(performanceInsights.createdAt))
      .limit(6),
  );
  if (insights.length === 0) return '';
  const lines = insights.map((i) => `- [${i.kind}] ${i.summary}`);
  return `What worked (latest measured performance):\n${lines.join('\n')}`.slice(0, 1200);
}

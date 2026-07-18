import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { intelSnapshots } from '../db/schema/intel-snapshots.js';

// Read prior intel snapshots for week-over-week comparison (design §12).
export async function queryIntelHistory(
  db: Db,
  tenantId: string,
  opts: { type?: 'market' | 'trend' | 'competitor'; limit?: number } = {},
) {
  const limit = opts.limit ?? 10;
  return db.withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(intelSnapshots)
      .where(
        opts.type
          ? and(eq(intelSnapshots.tenantId, tenantId), eq(intelSnapshots.type, opts.type))
          : eq(intelSnapshots.tenantId, tenantId),
      )
      .orderBy(desc(intelSnapshots.createdAt))
      .limit(limit),
  );
}

import { z } from 'zod';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { systemEvents } from '../../db/schema/system-events.js';
import { auditLog } from '../../db/schema/audit-log.js';

const EventsQuery = z.object({
  category: z.string().max(64).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  campaignId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const AuditQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export function registerEventRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  // Activity feed (design §7.1) — filterable by category, severity, campaign.
  app.get('/tenants/:id/events', { preHandler: hooks.requireTenantMember }, async (req) => {
    const q = EventsQuery.parse(req.query);
    const tenantId = req.tenantId!;
    const filters: SQL[] = [];
    if (q.category) filters.push(eq(systemEvents.category, q.category));
    if (q.severity) filters.push(eq(systemEvents.severity, q.severity));
    if (q.campaignId) filters.push(eq(systemEvents.campaignId, q.campaignId));

    const events = await db.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(systemEvents)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(systemEvents.createdAt))
        .limit(q.limit),
    );
    return { events };
  });

  // Compliance audit log (design §7.1).
  app.get('/tenants/:id/audit', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { limit } = AuditQuery.parse(req.query);
    const tenantId = req.tenantId!;
    const audit = await db.withTenant(tenantId, (tx) =>
      tx.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit),
    );
    return { audit };
  });
}

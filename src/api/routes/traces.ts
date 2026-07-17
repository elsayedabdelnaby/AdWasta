import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { agentTraces } from '../../db/schema/agent-traces.js';

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export function registerTraceRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  app.get('/tenants/:id/traces', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { limit } = ListQuery.parse(req.query);
    const tenantId = req.tenantId!;
    const traces = await db.withTenant(tenantId, (tx) =>
      tx.select().from(agentTraces).orderBy(desc(agentTraces.createdAt)).limit(limit),
    );
    return { traces };
  });

  app.get('/traces/:id', async (req, reply) => {
    const traceId = (req.params as { id: string }).id;
    const tenantId = await hooks.authorizeResource(req, reply, 'traces', traceId);
    if (!tenantId) return;
    const rows = await db.withTenant(tenantId, (tx) =>
      tx.select().from(agentTraces).where(eq(agentTraces.id, traceId)),
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });
}

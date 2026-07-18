import { z } from 'zod';
import { desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { startTrace } from '../../observability/trace.js';
import { engagementItems } from '../../db/schema/engagement-items.js';
import { draftReply, executeReply, type EngagementDeps } from '../../arms/engagement/draft-replies.js';
import type { ResearchProviders } from './intel.js';

export function registerEngagementRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ResearchProviders },
): void {
  const { db, hooks, providers } = deps;

  const DraftBody = z.object({
    type: z.enum(['comment', 'message']),
    platform: z.string(),
    threadId: z.string().optional(),
    inboundText: z.string().min(1),
  });

  // v1 input: manual paste of a comment/DM thread → drafted reply → approval inbox.
  app.post('/tenants/:id/engagement/draft', { preHandler: hooks.requireTenantMember }, async (req) => {
    const body = DraftBody.parse(req.body);
    const tenantId = req.tenantId!;
    const trace = await startTrace(db, tenantId, { crew: 'ops', arm: 'engagement' });
    const d: EngagementDeps = { db, llm: providers.llm, models: providers.models, trace, traceId: trace.traceId };
    try {
      const r = await draftReply(d, tenantId, body);
      await trace.finish('completed');
      return r;
    } catch (err) {
      await trace.finish('failed');
      throw err;
    }
  });

  app.get('/tenants/:id/engagement', { preHandler: hooks.requireTenantMember }, async (req) => {
    const items = await db.withTenant(req.tenantId!, (tx) =>
      tx.select().from(engagementItems).orderBy(desc(engagementItems.createdAt)).limit(100),
    );
    return { items };
  });

  app.post('/tenants/:id/engagement/:itemId/execute', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { itemId } = req.params as { itemId: string };
    return executeReply(db, req.tenantId!, itemId);
  });
}

import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import type { LlmClient } from '../../llm/openrouter.js';
import type { SearchProvider } from '../../tools/search-web.js';
import type { ModelTiers } from '../../config/model-routing.js';
import { competitors, competitorAlerts } from '../../db/schema/competitors.js';
import { startTrace } from '../../observability/trace.js';
import type { IntelArmDeps } from '../../arms/intel-arm.js';
import { runMarketArm } from '../../arms/market/run.js';
import { runTrendArm } from '../../arms/trends/run.js';
import { runCompetitorArm } from '../../arms/competitors/run.js';
import { runResearchCrew } from '../../brain/research-orchestrator.js';

export interface ResearchProviders {
  llm: LlmClient;
  search: SearchProvider;
  models: ModelTiers;
}

export function registerIntelRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ResearchProviders },
): void {
  const { db, hooks, providers } = deps;

  // Runs `fn` with arm deps bound to a fresh trace, and always finishes the trace
  // (completed / failed) so no agent_traces row is left permanently 'running'.
  // NOTE (design §18): these run synchronously for R1 (one manually-onboarded
  // tenant, fake-fast in tests). Moving them onto the async job API — which needs
  // research providers wired into the worker — is a deliberate follow-up.
  async function withResearchTrace<T>(tenantId: string, fn: (d: IntelArmDeps) => Promise<T>): Promise<T> {
    const trace = await startTrace(db, tenantId, { crew: 'research' });
    const d: IntelArmDeps = {
      db,
      llm: providers.llm,
      search: providers.search,
      models: providers.models,
      trace,
      traceId: trace.traceId,
    };
    try {
      const result = await fn(d);
      await trace.finish('completed');
      return result;
    } catch (err) {
      await trace.finish('failed');
      throw err;
    }
  }

  // Full RESEARCH pillar (market + trend + competitor, parallel).
  app.post('/tenants/:id/research/run', { preHandler: hooks.requireTenantMember }, async (req) =>
    withResearchTrace(req.tenantId!, async (d) => {
      const research = await runResearchCrew(d, req.tenantId!);
      return {
        summary: research.summary,
        citations: research.citations,
        alerts: research.competitors.filter((c) => c.alertId).length,
      };
    }),
  );

  app.post('/tenants/:id/intel/market', { preHandler: hooks.requireTenantMember }, async (req) =>
    withResearchTrace(req.tenantId!, (d) => runMarketArm(d, req.tenantId!)),
  );

  app.post('/tenants/:id/intel/trends', { preHandler: hooks.requireTenantMember }, async (req) =>
    withResearchTrace(req.tenantId!, (d) => runTrendArm(d, req.tenantId!)),
  );

  const CompetitorBody = z.object({ competitorId: z.string().uuid().optional() });
  app.post('/tenants/:id/intel/competitors', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { competitorId } = CompetitorBody.parse(req.body ?? {});
    const tenantId = req.tenantId!;
    return withResearchTrace(tenantId, async (d) => {
      if (competitorId) return [await runCompetitorArm(d, tenantId, competitorId)];
      const comps = await db.withTenant(tenantId, (tx) =>
        tx.select({ id: competitors.id }).from(competitors).where(and(eq(competitors.tenantId, tenantId), eq(competitors.watchEnabled, true))),
      );
      return Promise.all(comps.map((c) => runCompetitorArm(d, tenantId, c.id)));
    });
  });

  app.get('/tenants/:id/competitor-alerts', { preHandler: hooks.requireTenantMember }, async (req) => {
    const alerts = await db.withTenant(req.tenantId!, (tx) =>
      tx
        .select()
        .from(competitorAlerts)
        .where(eq(competitorAlerts.status, 'open'))
        .orderBy(desc(competitorAlerts.createdAt)),
    );
    return { alerts };
  });

  app.post(
    '/tenants/:id/competitor-alerts/:alertId/dismiss',
    { preHandler: hooks.requireTenantMember },
    async (req, reply) => {
      const { alertId } = req.params as { alertId: string };
      const [row] = await db.withTenant(req.tenantId!, (tx) =>
        tx
          .update(competitorAlerts)
          .set({ status: 'dismissed', updatedAt: new Date() })
          .where(eq(competitorAlerts.id, alertId))
          .returning(),
      );
      if (!row) return reply.code(404).send({ error: 'not found' });
      return { dismissed: true };
    },
  );
}

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { startTrace } from '../../observability/trace.js';
import { generateStrategy, type StrategyDeps } from '../../arms/strategy/generate.js';
import { generateCounterCampaign } from '../../arms/strategy/counter.js';
import type { ResearchProviders } from './intel.js';

export function registerStrategyRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ResearchProviders },
): void {
  const { db, hooks, providers } = deps;

  // Sam crew runs synchronously for R1 (see intel.ts note); trace always finished.
  async function withStrategyTrace<T>(tenantId: string, fn: (d: StrategyDeps) => Promise<T>): Promise<T> {
    const trace = await startTrace(db, tenantId, { crew: 'strategy' });
    const d: StrategyDeps = { db, llm: providers.llm, models: providers.models, trace, traceId: trace.traceId };
    try {
      const result = await fn(d);
      await trace.finish('completed');
      return result;
    } catch (err) {
      await trace.finish('failed');
      throw err;
    }
  }

  const GenerateBody = z.object({ audienceModel: z.enum(['b2b', 'b2c']).optional() });
  app.post('/tenants/:id/strategy/generate', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { audienceModel } = GenerateBody.parse(req.body ?? {});
    return withStrategyTrace(req.tenantId!, (d) => generateStrategy(d, req.tenantId!, { audienceModel }));
  });

  const CounterBody = z.object({ competitorAlertId: z.string().uuid() });
  app.post('/tenants/:id/campaign/counter', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { competitorAlertId } = CounterBody.parse(req.body);
    return withStrategyTrace(req.tenantId!, (d) => generateCounterCampaign(d, req.tenantId!, competitorAlertId));
  });
}

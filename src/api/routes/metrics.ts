import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { startTrace } from '../../observability/trace.js';
import { importMetrics, parseMetricsCsv, type MetricInput } from '../../metrics/import.js';
import { runAnalystArm, type AnalystDeps } from '../../arms/analyst/run.js';
import { performanceInsights } from '../../db/schema/performance-insights.js';
import { messagingAngles } from '../../db/schema/messaging-angles.js';
import { marketingPlans } from '../../db/schema/marketing-plans.js';
import type { ResearchProviders } from './intel.js';

const MetricRowSchema = z.object({
  publishedItemId: z.string().uuid(),
  impressions: z.number().int().optional(),
  reach: z.number().int().optional(),
  likes: z.number().int().optional(),
  comments: z.number().int().optional(),
  shares: z.number().int().optional(),
  clicks: z.number().int().optional(),
  saves: z.number().int().optional(),
  videoViews: z.number().int().optional(),
  opens: z.number().int().optional(),
  bounces: z.number().int().optional(),
  unsubscribes: z.number().int().optional(),
});

export function registerMetricsRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ResearchProviders },
): void {
  const { db, hooks, providers } = deps;

  async function runAnalyst(tenantId: string) {
    const trace = await startTrace(db, tenantId, { crew: 'measure', arm: 'analyst' });
    const analystDeps: AnalystDeps = { db, llm: providers.llm, models: providers.models, trace, traceId: trace.traceId };
    try {
      const r = await runAnalystArm(analystDeps, tenantId);
      await trace.finish('completed');
      return r;
    } catch (err) {
      await trace.finish('failed');
      throw err;
    }
  }

  // Manual/CSV metrics import; triggers an analyst run afterward (Task 3.5.4).
  const ImportBody = z.object({ rows: z.array(MetricRowSchema).optional(), csv: z.string().optional(), runAnalyst: z.boolean().default(true) });
  app.post('/tenants/:id/metrics/import', { preHandler: hooks.requireTenantMember }, async (req) => {
    const body = ImportBody.parse(req.body ?? {});
    const rows: MetricInput[] = [...(body.rows ?? []), ...(body.csv ? parseMetricsCsv(body.csv) : [])];
    const result = await importMetrics(db, req.tenantId!, rows);
    const analyst = body.runAnalyst && result.imported > 0 ? await runAnalyst(req.tenantId!) : undefined;
    return { ...result, analyst };
  });

  app.post('/tenants/:id/analyst/run', { preHandler: hooks.requireTenantMember }, async (req) => runAnalyst(req.tenantId!));

  app.get('/tenants/:id/insights', { preHandler: hooks.requireTenantMember }, async (req) => {
    const insights = await db.withTenant(req.tenantId!, (tx) =>
      tx.select().from(performanceInsights).orderBy(desc(performanceInsights.createdAt)).limit(50),
    );
    return { insights };
  });

  app.get('/tenants/:id/performance', { preHandler: hooks.requireTenantMember }, async (req) => {
    const tenantId = req.tenantId!;
    const [angles, plan, insights] = await Promise.all([
      db.withTenant(tenantId, (tx) => tx.select({ id: messagingAngles.id, angle: messagingAngles.angle, score: messagingAngles.performanceScore, status: messagingAngles.status }).from(messagingAngles).where(eq(messagingAngles.tenantId, tenantId))),
      db.withTenant(tenantId, (tx) => tx.select().from(marketingPlans).where(and(eq(marketingPlans.tenantId, tenantId), eq(marketingPlans.status, 'active'))).limit(1)),
      db.withTenant(tenantId, (tx) => tx.select().from(performanceInsights).orderBy(desc(performanceInsights.createdAt)).limit(20)),
    ]);
    return { angleScores: angles, kpis: plan[0]?.kpis ?? [], insights };
  });
}

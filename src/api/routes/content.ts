import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import type { LlmClient } from '../../llm/openrouter.js';
import type { ModelTiers } from '../../config/model-routing.js';
import type { ImageAdapter } from '../../adapters/image/types.js';
import { startTrace } from '../../observability/trace.js';
import { platformConnections } from '../../db/schema/platform-connections.js';
import { contentDrafts } from '../../db/schema/content-drafts.js';
import { visualBriefs } from '../../db/schema/visual-briefs.js';
import { generatedAssets } from '../../db/schema/generated-assets.js';
import { publishedItems } from '../../db/schema/approval-queue.js';
import { emitEvent, emitAudit } from '../../observability/events.js';
import { recommendContent, type ContentDeps } from '../../arms/content/recommend.js';
import { generateCopyPack } from '../../adapters/copy-pack/generate.js';

export interface ContentProviders {
  llm: LlmClient;
  models: ModelTiers;
  imageAdapter: ImageAdapter;
}

export function registerContentRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; providers: ContentProviders },
): void {
  const { db, hooks, providers } = deps;

  async function contentDeps(tenantId: string): Promise<{ d: ContentDeps; finish: (s: 'completed' | 'failed') => Promise<void> }> {
    const trace = await startTrace(db, tenantId, { crew: 'creation' });
    return {
      d: { db, llm: providers.llm, models: providers.models, imageAdapter: providers.imageAdapter, trace, traceId: trace.traceId },
      finish: (s) => trace.finish(s),
    };
  }

  const RecommendBody = z.object({
    platforms: z.array(z.string()).optional(),
    imageGenEnabled: z.boolean().optional(),
    maxVariants: z.number().int().min(1).max(3).optional(),
    campaignId: z.string().uuid().optional(),
    responseToAlertId: z.string().uuid().optional(),
    alertSummary: z.string().optional(),
  });

  app.post('/tenants/:id/content/recommend', { preHandler: hooks.requireTenantMember }, async (req) => {
    const body = RecommendBody.parse(req.body ?? {});
    const tenantId = req.tenantId!;
    // image gen from the tenant flag unless the request overrides it
    const flag = await db.withTenant(tenantId, async (tx) => {
      const rows = await tx.select({ e: platformConnections.imageGenEnabled }).from(platformConnections).where(eq(platformConnections.tenantId, tenantId));
      return rows.some((r) => r.e);
    });
    const { d, finish } = await contentDeps(tenantId);
    try {
      const result = await recommendContent(d, tenantId, { ...body, imageGenEnabled: body.imageGenEnabled ?? flag });
      await finish('completed');
      return result;
    } catch (err) {
      await finish('failed');
      throw err;
    }
  });

  // Ready-to-paste copy pack for an approved (or pending) draft.
  app.get('/tenants/:id/content/:draftId/copy-pack', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const { draftId } = req.params as { draftId: string };
    const tenantId = req.tenantId!;
    const pack = await db.withTenant(tenantId, async (tx) => {
      const [draft] = await tx.select().from(contentDrafts).where(eq(contentDrafts.id, draftId));
      if (!draft) return null;
      const [vb] = await tx.select().from(visualBriefs).where(eq(visualBriefs.draftId, draftId));
      const assets = await tx.select({ url: generatedAssets.url }).from(generatedAssets).where(eq(generatedAssets.draftId, draftId));
      return generateCopyPack(draft, vb ? { prompt: vb.prompt, aspectRatio: vb.aspectRatio } : null, assets.map((a) => a.url));
    });
    if (!pack) return reply.code(404).send({ error: 'not found' });
    return pack;
  });

  app.post('/tenants/:id/content/:draftId/regenerate-image', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const { draftId } = req.params as { draftId: string };
    const tenantId = req.tenantId!;
    const vb = await db.withTenant(tenantId, async (tx) => {
      const [row] = await tx.select().from(visualBriefs).where(eq(visualBriefs.draftId, draftId));
      return row ?? null;
    });
    if (!vb) return reply.code(404).send({ error: 'no visual brief for draft' });
    const gen = await providers.imageAdapter.generate({ prompt: vb.prompt, model: 'gemini-3-pro-image', aspectRatio: vb.aspectRatio as never, variants: 1 });
    await db.withTenant(tenantId, async (tx) => {
      for (const asset of gen.assets) {
        await tx.insert(generatedAssets).values({ tenantId, draftId, url: asset.url, model: 'gemini-3-pro-image', prompt: vb.prompt, variantIndex: asset.variantIndex, costUsd: String(gen.costUsd) });
      }
      await emitEvent(tx, tenantId, { actorType: 'crew', category: 'campaign', action: 'image.regenerate_requested', resourceType: 'content_draft', resourceId: draftId, message: 'image regenerated' });
    });
    return { regenerated: gen.assets.length };
  });

  // Mark as published (Task 3.8) — the copy-pack flow's only way to anchor metrics.
  const PublishedBody = z.object({ draftId: z.string().uuid(), platform: z.string(), url: z.string().url().optional(), mode: z.enum(['copy_pack', 'api']).default('copy_pack') });
  app.post('/tenants/:id/published-items', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const body = PublishedBody.parse(req.body);
    const tenantId = req.tenantId!;
    const result = await db.withTenant(tenantId, async (tx) => {
      const [draft] = await tx.select({ status: contentDrafts.status }).from(contentDrafts).where(eq(contentDrafts.id, body.draftId));
      if (!draft) return { error: 'draft not found' as const };
      if (draft.status !== 'approved') return { error: 'draft not approved' as const };
      const [item] = await tx.insert(publishedItems).values({ tenantId, draftId: body.draftId, platform: body.platform, url: body.url, mode: body.mode }).returning();
      await emitAudit(tx, tenantId, { actorType: 'user', actorId: req.session!.userId, category: 'ops', action: 'item.published', resourceType: 'published_item', resourceId: item!.id, message: `marked published on ${body.platform}`, payload: { draftId: body.draftId, platform: body.platform, mode: body.mode } });
      return { item };
    });
    if ('error' in result) return reply.code(result.error === 'draft not found' ? 404 : 409).send({ error: result.error });
    return { published: true, id: result.item!.id };
  });

  // List drafts (for the thin UI).
  app.get('/tenants/:id/content/drafts', { preHandler: hooks.requireTenantMember }, async (req) => {
    const tenantId = req.tenantId!;
    const rows = await db.withTenant(tenantId, (tx) =>
      tx.select().from(contentDrafts).where(eq(contentDrafts.tenantId, tenantId)).orderBy(desc(contentDrafts.createdAt)).limit(50),
    );
    return { drafts: rows };
  });
}

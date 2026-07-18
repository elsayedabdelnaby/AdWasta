import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { LlmClient, type StepSink } from '../../llm/openrouter.js';
import { routeModel, type ModelTiers } from '../../config/model-routing.js';
import { tenantProfiles } from '../../db/schema/tenants.js';
import { marketingPlans } from '../../db/schema/marketing-plans.js';
import { messagingAngles } from '../../db/schema/messaging-angles.js';
import { intelSnapshots } from '../../db/schema/intel-snapshots.js';
import { contentDrafts } from '../../db/schema/content-drafts.js';
import { visualBriefs } from '../../db/schema/visual-briefs.js';
import { generatedAssets } from '../../db/schema/generated-assets.js';
import { approvalQueue } from '../../db/schema/approval-queue.js';
import { emitEvent } from '../../observability/events.js';
import type { ImageAdapter } from '../../adapters/image/types.js';
import { applyUtm } from './utm.js';
import { loadPerformanceContext } from '../../metrics/feedback.js';
import { ContentSchema, buildContentMessages, type DraftData } from './prompts.js';

export interface ContentDeps {
  db: Db;
  llm: LlmClient;
  models: ModelTiers;
  trace?: StepSink;
  traceId?: string;
  imageAdapter?: ImageAdapter;
}

export interface RecommendOpts {
  campaignId?: string;
  responseToAlertId?: string;
  alertSummary?: string;
  platforms?: string[];
  imageGenEnabled?: boolean;
  maxVariants?: number;
}

export const MAX_DRAFTS_PER_CHANNEL_PER_DAY = 5;

export interface RecommendResult {
  draftIds: string[];
  imageCount: number;
  cappedChannels: string[];
}

/**
 * Content arm (Jordan, CREATION). Uses the active plan + angles + latest intel to
 * write social + email drafts, each with a visual brief (always), applies UTM to
 * every link, optionally generates images when enabled, and enqueues everything to
 * the approval inbox. Nothing publishes here — approval is a separate step.
 */
export async function recommendContent(
  deps: ContentDeps,
  tenantId: string,
  opts: RecommendOpts = {},
): Promise<RecommendResult> {
  const platforms = opts.platforms ?? ['facebook'];

  const ctx = await deps.db.withTenant(tenantId, async (tx) => {
    const [profile] = await tx.select({ voice: tenantProfiles.voice }).from(tenantProfiles).where(eq(tenantProfiles.tenantId, tenantId));
    const [plan] = await tx.select().from(marketingPlans).where(and(eq(marketingPlans.tenantId, tenantId), eq(marketingPlans.status, 'active'))).orderBy(desc(marketingPlans.createdAt)).limit(1);
    const angles = await tx.select().from(messagingAngles).where(and(eq(messagingAngles.tenantId, tenantId), eq(messagingAngles.status, 'active'))).limit(10);
    const intel = await tx.select({ summary: intelSnapshots.summary }).from(intelSnapshots).orderBy(desc(intelSnapshots.createdAt)).limit(5);
    return {
      voice: profile?.voice ?? undefined,
      planStr: plan ? `themes: ${plan.themes.join(', ')}; channels: ${plan.channels.join(', ')}` : '(no plan)',
      anglesStr: angles.map((a) => `[${a.channel}] ${a.angle}`).join('\n'),
      angleList: angles.map((a) => ({ id: a.id, channel: a.channel })),
      intelStr: intel.map((i) => i.summary).join('\n'),
    };
  });

  const performance = await loadPerformanceContext(deps.db, tenantId);
  const out = await deps.llm.structuredComplete({
    model: routeModel('balanced', deps.models),
    schema: ContentSchema,
    trace: deps.trace,
    messages: buildContentMessages({
      voice: ctx.voice,
      plan: ctx.planStr,
      angles: ctx.anglesStr,
      intel: ctx.intelStr,
      platforms,
      isCounter: Boolean(opts.responseToAlertId),
      alertSummary: opts.alertSummary,
      performance,
    }),
  });

  // Enforce the per-channel/day cap (design §25).
  const cappedChannels: string[] = [];
  const drafts = await capPerChannel(deps.db, tenantId, out.drafts, cappedChannels);

  const draftIds: string[] = [];
  let imageCount = 0;

  for (const draft of drafts) {
    const draftId = await persistDraft(deps.db, tenantId, draft, opts, ctx.angleList);
    draftIds.push(draftId);

    // Visual brief: always for social; email hero when provided.
    if (draft.channel === 'social' || draft.visualBrief) {
      const vb = draft.visualBrief ?? { format: 'social image', mood: 'on-brand', aspectRatio: undefined, prompt: draft.body.slice(0, 200) };
      const aspectRatio = vb.aspectRatio ?? '1:1';
      await deps.db.withTenant(tenantId, (tx) =>
        tx.insert(visualBriefs).values({ tenantId, draftId, format: vb.format, mood: vb.mood, aspectRatio, prompt: vb.prompt }),
      );

      // Optional image generation (Task 3.4).
      if (opts.imageGenEnabled && deps.imageAdapter && draft.channel === 'social') {
        const gen = await deps.imageAdapter.generate({
          prompt: vb.prompt,
          model: 'gemini-3-pro-image',
          aspectRatio,
          variants: Math.max(1, opts.maxVariants ?? 1),
        });
        // Split the batch cost across variants so a rollup sums to the real spend.
        const perAssetCost = gen.assets.length > 0 ? gen.costUsd / gen.assets.length : 0;
        await deps.db.withTenant(tenantId, async (tx) => {
          for (const asset of gen.assets) {
            const [row] = await tx
              .insert(generatedAssets)
              .values({ tenantId, draftId, url: asset.url, model: 'gemini-3-pro-image', prompt: vb.prompt, variantIndex: asset.variantIndex, costUsd: String(perAssetCost) })
              .returning({ id: generatedAssets.id });
            await tx.insert(approvalQueue).values({ tenantId, resourceType: 'generated_asset', resourceId: row!.id, kind: 'image', risk: 'MEDIUM' });
            imageCount += 1;
          }
        });
      }
    }

    // Approval row (HIGH risk — publish/send requires human approval).
    await deps.db.withTenant(tenantId, (tx) =>
      tx.insert(approvalQueue).values({ tenantId, resourceType: 'content_draft', resourceId: draftId, kind: draft.channel === 'email' ? 'email' : 'post', risk: 'HIGH' }),
    );
  }

  await deps.db.withTenant(tenantId, (tx) =>
    emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'creation.finished',
      campaignId: opts.campaignId,
      message: `content: ${draftIds.length} drafts, ${imageCount} images`,
      payload: { drafts: draftIds.length, images: imageCount },
    }),
  );

  return { draftIds, imageCount, cappedChannels };
}

async function capPerChannel(db: Db, tenantId: string, drafts: DraftData[], cappedChannels: string[]): Promise<DraftData[]> {
  const since = sql`date_trunc('day', now())`;
  const kept: DraftData[] = [];
  const perChannelKept: Record<string, number> = {};
  const existing = await db.withTenant(tenantId, (tx) =>
    tx
      .select({ channel: contentDrafts.channel, n: sql<number>`count(*)::int` })
      .from(contentDrafts)
      .where(gte(contentDrafts.createdAt, since))
      .groupBy(contentDrafts.channel),
  );
  const already: Record<string, number> = {};
  for (const row of existing) already[row.channel] = row.n;

  for (const d of drafts) {
    const used = (already[d.channel] ?? 0) + (perChannelKept[d.channel] ?? 0);
    if (used >= MAX_DRAFTS_PER_CHANNEL_PER_DAY) {
      if (!cappedChannels.includes(d.channel)) cappedChannels.push(d.channel);
      continue;
    }
    kept.push(d);
    perChannelKept[d.channel] = (perChannelKept[d.channel] ?? 0) + 1;
  }
  return kept;
}

async function persistDraft(
  db: Db,
  tenantId: string,
  draft: DraftData,
  opts: RecommendOpts,
  angleList: { id: string; channel: string }[],
): Promise<string> {
  // Link the draft to an active angle for its channel so MEASURE can group by
  // angle (the feedback loop is inert otherwise).
  const angleId = angleList.find((a) => a.channel === draft.channel)?.id ?? angleList[0]?.id;
  return db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(contentDrafts)
      .values({
        tenantId,
        campaignId: opts.campaignId,
        responseToAlertId: opts.responseToAlertId,
        angleId,
        channel: draft.channel,
        platform: draft.platform,
        subject: draft.subject,
        preheader: draft.preheader,
        body: draft.body,
        rationale: draft.rationale,
        status: 'pending_approval',
      })
      .returning({ id: contentDrafts.id });
    const id = row!.id;
    // UTM every link (always on). utm_campaign=campaign (or the draft when organic).
    const utmBody = applyUtm(draft.body, opts.campaignId ?? id, id);
    if (utmBody !== draft.body) {
      await tx.update(contentDrafts).set({ body: utmBody, updatedAt: new Date() }).where(eq(contentDrafts.id, id));
    }
    return id;
  });
}

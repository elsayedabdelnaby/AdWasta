import type { ZodType } from 'zod';
import type { Db } from '../db/client.js';
import { LlmClient, type ChatMessage, type StepSink } from '../llm/openrouter.js';
import { routeModel, type ModelTiers, type TaskClass } from '../config/model-routing.js';
import type { SearchProvider } from '../tools/search-web.js';
import { sanitizeExternal } from '../guardrails/sanitize-external.js';
import { intelSnapshots } from '../db/schema/intel-snapshots.js';
import { emitEvent } from '../observability/events.js';
import type { ArmId, ArmResult } from '../harness/types.js';

export interface IntelArmDeps {
  db: Db;
  llm: LlmClient;
  search: SearchProvider;
  models: ModelTiers;
  trace?: StepSink;
  traceId?: string;
}

export interface IntelArmConfig<T> {
  type: 'market' | 'trend' | 'competitor';
  arm: ArmId;
  tier: TaskClass;
  queries: string[];
  buildMessages: (sanitizedContext: string) => ChatMessage[];
  schema: ZodType<T>;
  summarize: (data: T) => string;
  competitorId?: string;
  /** Extra sanitized context (e.g. pasted intel) folded into the prompt. */
  extraContext?: string;
}

export interface IntelArmOutput<T> {
  result: ArmResult<T>;
  snapshotId: string;
}

/**
 * The shared RESEARCH arm flow (design §12): gather cited context via tools →
 * sanitize (untrusted) → LLM interprets into a typed snapshot → persist with
 * REQUIRED citations. citations come from the tools (real URLs), never fabricated
 * by the model. Returns the typed ArmResult + snapshot id.
 */
export async function runIntelArm<T>(
  deps: IntelArmDeps,
  tenantId: string,
  config: IntelArmConfig<T>,
): Promise<IntelArmOutput<T>> {
  const citations: string[] = [];
  const contextParts: string[] = [];
  for (const q of config.queries) {
    const res = await deps.search.search(q);
    citations.push(...res.citations);
    for (const r of res.results) contextParts.push(`# ${r.title}\n${r.snippet}\n(${r.url})`);
  }
  const rawContext = [contextParts.join('\n\n'), config.extraContext ?? ''].filter(Boolean).join('\n\n');
  const sanitized = sanitizeExternal(rawContext);

  const data = await deps.llm.structuredComplete({
    model: routeModel(config.tier, deps.models),
    messages: config.buildMessages(sanitized),
    schema: config.schema,
    trace: deps.trace,
  });

  const uniqueCitations = [...new Set(citations)];
  const summary = config.summarize(data);

  // We persist the snapshot even with zero citations (keep the record); the
  // eval gate flags it and the Content arm's read path (Phase 3) must exclude
  // citation-less snapshots per design §12 — exclusion is a read-time filter,
  // not a write-time drop.
  const snapshotId = await deps.db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(intelSnapshots)
      .values({
        tenantId,
        type: config.type,
        competitorId: config.competitorId,
        summary,
        data: data as Record<string, unknown>,
        citations: uniqueCitations,
      })
      .returning({ id: intelSnapshots.id });
    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: `intel.${config.type}_captured`,
      resourceType: 'intel_snapshot',
      resourceId: row!.id,
      message: `${config.type} intel captured`,
    });
    return row!.id;
  });

  return {
    snapshotId,
    result: {
      arm: config.arm,
      tenantId,
      traceId: deps.traceId ?? snapshotId,
      summary,
      data,
      citations: uniqueCitations,
    },
  };
}

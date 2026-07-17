import { z, type ZodTypeAny } from 'zod';
import type { ArmId } from '../harness/types.js';

export type ToolFlag = 'imageGenEnabled' | 'apiEmailEnabled';

export interface ToolDef {
  name: string;
  description: string;
  schema: ZodTypeAny;
  /** When set, the tool is only exposed if the flag is on (design §9). */
  requiresFlag?: ToolFlag;
}

// Global tool catalog. Phase 0 registers definitions + argument schemas only —
// execution logic lands with each arm's phase. Schemas gate args before execute.
const CATALOG: Record<string, ToolDef> = {
  // RESEARCH
  search_serp: { name: 'search_serp', description: 'SERP + keyword results', schema: z.object({ query: z.string().min(1) }) },
  search_web: { name: 'search_web', description: 'General web search', schema: z.object({ query: z.string().min(1) }) },
  fetch_web_page: { name: 'fetch_web_page', description: 'Fetch a page (robots-respecting)', schema: z.object({ url: z.string().url() }) },
  fetch_feed: { name: 'fetch_feed', description: 'Conditional-GET RSS/Atom feed', schema: z.object({ url: z.string().url() }) },
  read_pasted_intel: { name: 'read_pasted_intel', description: 'Ingest user-pasted competitor intel', schema: z.object({ text: z.string().min(1) }) },
  fetch_provider_data: { name: 'fetch_provider_data', description: 'Optional paid intel provider', schema: z.object({ query: z.string().min(1) }) },
  query_intel_history: { name: 'query_intel_history', description: 'Prior intel snapshots', schema: z.object({ type: z.string().optional() }) },
  detect_campaign_change: { name: 'detect_campaign_change', description: 'Diff vs previous snapshot', schema: z.object({ competitorId: z.string() }) },
  // STRATEGY
  read_profile: { name: 'read_profile', description: 'Tenant profile', schema: z.object({}) },
  write_icp: { name: 'write_icp', description: 'Persist ICP', schema: z.object({}).passthrough() },
  write_personas: { name: 'write_personas', description: 'Persist personas', schema: z.object({}).passthrough() },
  write_angles: { name: 'write_angles', description: 'Persist messaging angles', schema: z.object({}).passthrough() },
  write_plan: { name: 'write_plan', description: 'Persist marketing plan', schema: z.object({}).passthrough() },
  // CREATION
  read_plan: { name: 'read_plan', description: 'Latest marketing plan', schema: z.object({}) },
  read_angles: { name: 'read_angles', description: 'Messaging angles', schema: z.object({}) },
  read_intel: { name: 'read_intel', description: 'Latest intel summaries', schema: z.object({}) },
  write_draft: { name: 'write_draft', description: 'Persist a content draft', schema: z.object({}).passthrough() },
  write_visual_brief: { name: 'write_visual_brief', description: 'Persist a visual brief', schema: z.object({}).passthrough() },
  generate_image: { name: 'generate_image', description: 'Image via Gemini adapter', schema: z.object({ prompt: z.string().min(1) }), requiresFlag: 'imageGenEnabled' },
  // OPS — daily strategist
  read_all_tenant_state: { name: 'read_all_tenant_state', description: 'Aggregate tenant state', schema: z.object({}) },
  trigger_content_if_needed: { name: 'trigger_content_if_needed', description: 'Kick content arm when thin', schema: z.object({}) },
  // OPS — scheduler
  read_calendar: { name: 'read_calendar', description: 'Calendar entries', schema: z.object({}) },
  write_schedule: { name: 'write_schedule', description: 'Persist a schedule', schema: z.object({}).passthrough() },
  enqueue_execution: { name: 'enqueue_execution', description: 'Queue an armed execution', schema: z.object({}).passthrough() },
  // OPS — engagement
  read_comments: { name: 'read_comments', description: 'Inbound comments', schema: z.object({}) },
  read_messages: { name: 'read_messages', description: 'Inbound DMs', schema: z.object({}) },
  write_reply_draft: { name: 'write_reply_draft', description: 'Persist a reply draft', schema: z.object({}).passthrough() },
  // OPS — publisher
  resolve_adapter: { name: 'resolve_adapter', description: 'Resolve platform adapter', schema: z.object({ platform: z.string() }) },
  publish: { name: 'publish', description: 'Execute an approved publish', schema: z.object({ approvalId: z.string() }) },
  reply_to_comment: { name: 'reply_to_comment', description: 'Execute an approved comment reply', schema: z.object({ approvalId: z.string() }) },
  reply_to_message: { name: 'reply_to_message', description: 'Execute an approved DM reply', schema: z.object({ approvalId: z.string() }) },
  send_email: { name: 'send_email', description: 'Execute an approved email send', schema: z.object({ approvalId: z.string() }), requiresFlag: 'apiEmailEnabled' },
  // MEASURE — analyst
  read_metric_stats: { name: 'read_metric_stats', description: 'Pre-computed stats (never raw)', schema: z.object({}) },
  read_published_items: { name: 'read_published_items', description: 'Published item anchors', schema: z.object({}) },
  write_insights: { name: 'write_insights', description: 'Persist performance insights', schema: z.object({}).passthrough() },
  update_angle_scores: { name: 'update_angle_scores', description: 'Update angle scores', schema: z.object({}).passthrough() },
};

// Arm → visible tools (design §9). The subset is intentionally small per arm.
const ARM_TOOLS: Record<ArmId, string[]> = {
  market: ['search_serp', 'search_web', 'query_intel_history'],
  trends: ['search_web', 'fetch_feed', 'query_intel_history'],
  competitors: ['fetch_web_page', 'fetch_feed', 'search_web', 'read_pasted_intel', 'fetch_provider_data', 'query_intel_history', 'detect_campaign_change'],
  strategy: ['read_profile', 'write_icp', 'write_personas', 'write_angles', 'write_plan'],
  content: ['read_plan', 'read_angles', 'read_intel', 'write_draft', 'write_visual_brief', 'generate_image'],
  daily_strategist: ['read_all_tenant_state', 'trigger_content_if_needed'],
  scheduler: ['read_calendar', 'write_schedule', 'enqueue_execution'],
  engagement: ['read_comments', 'read_messages', 'write_reply_draft'],
  publisher: ['resolve_adapter', 'publish', 'reply_to_comment', 'reply_to_message', 'send_email'],
  analyst: ['read_metric_stats', 'read_published_items', 'read_angles', 'write_insights', 'update_angle_scores'],
};

export interface ToolFlags {
  imageGenEnabled?: boolean;
  apiEmailEnabled?: boolean;
}

export function getTool(name: string): ToolDef | undefined {
  return CATALOG[name];
}

/** Only the active arm's tools, minus any whose feature flag is off (design §9). */
export function getToolsForArm(armId: ArmId, flags: ToolFlags = {}): ToolDef[] {
  const names = ARM_TOOLS[armId];
  if (!names) return [];
  return names
    .map((n) => CATALOG[n])
    .filter((t): t is ToolDef => Boolean(t))
    .filter((t) => !t.requiresFlag || flags[t.requiresFlag] === true);
}

/** Validate arguments against a tool's schema before execution. Throws on unknown
 *  tool or invalid args (design §9 tool execution rules). */
export function validateToolArgs(toolName: string, args: unknown): unknown {
  const tool = CATALOG[toolName];
  if (!tool) throw new Error(`unknown tool: ${toolName}`);
  return tool.schema.parse(args);
}

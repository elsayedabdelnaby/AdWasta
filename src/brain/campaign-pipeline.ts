import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { campaignRuns } from '../db/schema/campaign-runs.js';
import { emitEvent } from '../observability/events.js';
import type { ArmId, ArmResult } from '../harness/types.js';
import { PIPELINE_ORDER, prerequisiteStage, type PipelineStage } from './supervisor.js';
import { crewForArm, personaForArm } from '../crews/roster.js';

export interface CampaignRunState {
  id: string;
  status: string;
  currentStep: string;
  stepResults: Record<string, unknown>;
}

// Representative arm per pipeline stage (crew-level shell result).
const STAGE_ARM: Record<PipelineStage, ArmId> = {
  research: 'market',
  strategy: 'strategy',
  creation: 'content',
};

function toState(row: typeof campaignRuns.$inferSelect): CampaignRunState {
  return { id: row.id, status: row.status, currentStep: row.currentStep, stepResults: row.stepResults };
}

async function load(db: Db, tenantId: string, runId: string) {
  return db.withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(campaignRuns).where(eq(campaignRuns.id, runId));
    return row ?? null;
  });
}

export async function getCampaignRun(
  db: Db,
  tenantId: string,
  runId: string,
): Promise<CampaignRunState | null> {
  const row = await load(db, tenantId, runId);
  return row ? toState(row) : null;
}

/**
 * Run one pipeline stage: verify its prerequisite ArmResult is already on the DB
 * (order enforcement), produce this crew's ArmResult (a shell stub in Phase 0.5 —
 * real crews wire in later phases), and persist it. The next crew reads only from
 * the DB, never from an in-memory handoff.
 */
export async function runStage(
  db: Db,
  tenantId: string,
  runId: string,
  stage: PipelineStage,
): Promise<void> {
  const prereq = prerequisiteStage(stage);
  await db.withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(campaignRuns).where(eq(campaignRuns.id, runId));
    if (!row) throw new Error(`campaign run ${runId} not found`);
    if (prereq && !(prereq in row.stepResults)) {
      throw new Error(`stage "${stage}" requires "${prereq}" to have run first`);
    }

    const arm = STAGE_ARM[stage];
    const result: ArmResult = {
      arm,
      tenantId,
      traceId: runId, // shell: correlate to the run until a real trace exists
      summary: `${crewForArm(arm)} crew (${personaForArm(arm)}) completed ${stage} (shell)`,
      data: { stub: true, stage },
    };
    await tx
      .update(campaignRuns)
      .set({
        // atomic merge, so a concurrent stage write can't clobber this one
        stepResults: sql`${campaignRuns.stepResults} || ${JSON.stringify({ [stage]: result })}::jsonb`,
        currentStep: stage,
        updatedAt: new Date(),
      })
      .where(eq(campaignRuns.id, runId));
  });
}

/**
 * Run RESEARCH → STRATEGY → CREATION, then SUSPEND before OPS awaiting human
 * approval. State is durable in campaign_runs, so a later resume works even after
 * a process restart.
 */
export async function runCampaign(
  db: Db,
  tenantId: string,
  opts: { idea?: string } = {},
): Promise<CampaignRunState> {
  const runId = await db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(campaignRuns)
      .values({ tenantId, idea: opts.idea, status: 'running', currentStep: 'research' })
      .returning({ id: campaignRuns.id });
    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'campaign.started',
      resourceType: 'campaign_run',
      resourceId: row!.id,
      campaignId: row!.id,
      message: 'campaign pipeline started',
    });
    return row!.id;
  });

  for (const stage of PIPELINE_ORDER) {
    await runStage(db, tenantId, runId, stage);
  }

  // Suspend before OPS — this is the approval inbox (Task 3.5 reads suspended runs).
  const suspended = await db.withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .update(campaignRuns)
      .set({
        status: 'suspended',
        currentStep: 'awaiting_approval',
        suspendData: { awaiting: 'human_approval', stages: [...PIPELINE_ORDER] },
        updatedAt: new Date(),
      })
      .where(eq(campaignRuns.id, runId))
      .returning();
    await emitEvent(tx, tenantId, {
      actorType: 'crew',
      category: 'campaign',
      action: 'campaign.suspended',
      resourceType: 'campaign_run',
      resourceId: runId,
      campaignId: runId,
      message: 'campaign suspended for approval',
    });
    return row!;
  });

  return toState(suspended);
}

/**
 * Resume a suspended run after the approval decision. Approved → proceed through
 * OPS to done; rejected → bail. Idempotency guard: only a suspended run resumes.
 */
export async function resumeCampaign(
  db: Db,
  tenantId: string,
  runId: string,
  resume: { approved: boolean },
): Promise<CampaignRunState> {
  // The status guard and the transition are one atomic UPDATE: a second concurrent
  // resume (double-click / retry) matches zero rows and is rejected — no double
  // processing of this HIGH-risk approval gate.
  const updated = await db.withTenant(tenantId, async (tx) => {
    const set = resume.approved
      ? { status: 'completed', currentStep: 'done', resumeData: { approved: true }, updatedAt: new Date() }
      : { status: 'bailed', resumeData: { approved: false }, updatedAt: new Date() };
    const [row] = await tx
      .update(campaignRuns)
      .set(set)
      .where(and(eq(campaignRuns.id, runId), eq(campaignRuns.status, 'suspended')))
      .returning();
    if (!row) {
      throw new Error(`campaign run ${runId} is not suspended (not found or already resolved)`);
    }
    await emitEvent(tx, tenantId, {
      actorType: 'user',
      category: 'campaign',
      action: resume.approved ? 'campaign.completed' : 'campaign.bailed',
      resourceType: 'campaign_run',
      resourceId: runId,
      campaignId: runId,
      message: resume.approved ? 'campaign approved and completed' : 'campaign rejected at approval',
    });
    return row;
  });

  return toState(updated);
}

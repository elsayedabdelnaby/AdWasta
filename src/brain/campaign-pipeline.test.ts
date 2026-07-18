import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { campaignRuns } from '../db/schema/campaign-runs.js';
import { runCampaign, resumeCampaign, runStage, getCampaignRun } from './campaign-pipeline.js';

let db: Db;
const T = randomUUID();

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Pipeline Tenant' });
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM campaign_runs WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('campaign pipeline (Task 0.5.6 — hand-rolled durable suspend/resume)', () => {
  it('runs RESEARCH → STRATEGY → CREATION and suspends before OPS', async () => {
    const run = await runCampaign(db, T, { idea: 'launch a cold brew line' });
    expect(run.status).toBe('suspended');
    expect(run.currentStep).toBe('awaiting_approval');
    // each stage persisted an ArmResult
    expect(Object.keys(run.stepResults).sort()).toEqual(['creation', 'research', 'strategy']);
    expect((run.stepResults.research as { summary: string }).summary).toBeTruthy();
  });

  it('enforces stage order — STRATEGY cannot run before RESEARCH', async () => {
    const runId = await db.withTenant(T, async (tx) => {
      const [r] = await tx.insert(campaignRuns).values({ tenantId: T }).returning({ id: campaignRuns.id });
      return r!.id;
    });
    await expect(runStage(db, T, runId, 'strategy')).rejects.toThrow(/research/i);
  });

  it('survives a process restart mid-suspend: a fresh connection resumes to completion', async () => {
    const suspended = await runCampaign(db, T);
    expect(suspended.status).toBe('suspended');

    // Simulate a restart: brand-new Db (fresh pools), state loaded from Postgres.
    const db2 = createDb(loadConfig());
    try {
      const resumed = await resumeCampaign(db2, T, suspended.id, { approved: true });
      expect(resumed.status).toBe('completed');
      expect(resumed.currentStep).toBe('done');
    } finally {
      await db2.close();
    }
  });

  it('bails the run when the approval is rejected', async () => {
    const suspended = await runCampaign(db, T);
    const bailed = await resumeCampaign(db, T, suspended.id, { approved: false });
    expect(bailed.status).toBe('bailed');
  });

  it('refuses to resume a run that is not suspended', async () => {
    const suspended = await runCampaign(db, T);
    await resumeCampaign(db, T, suspended.id, { approved: true }); // -> completed
    await expect(resumeCampaign(db, T, suspended.id, { approved: true })).rejects.toThrow();
  });

  it('getCampaignRun reads back the persisted state', async () => {
    const run = await runCampaign(db, T);
    const loaded = await getCampaignRun(db, T, run.id);
    expect(loaded?.id).toBe(run.id);
    expect(loaded?.status).toBe('suspended');
  });
});

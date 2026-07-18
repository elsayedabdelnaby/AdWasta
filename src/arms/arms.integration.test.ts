import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants, tenantProfiles } from '../db/schema/tenants.js';
import { competitors, competitorAlerts } from '../db/schema/competitors.js';
import { intelSnapshots } from '../db/schema/intel-snapshots.js';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { FixtureSearchProvider } from '../tools/search-web.js';
import { runMarketArm } from './market/run.js';
import { runTrendArm } from './trends/run.js';
import { runCompetitorArm } from './competitors/run.js';
import { runCompetitorWatchCycle } from './competitors/watch.js';
import { systemEvents } from '../db/schema/system-events.js';
import type { IntelArmDeps } from './intel-arm.js';

const marketFixture = { keywords: ['cold brew', 'nitro'], demandSignals: ['rising'], serpLandscape: 'competitive', categoryGaps: ['premium'], summary: 'coffee market growing' };
const trendFixture = { trends: [{ name: 'oat milk', relevance: 'high', why: 'demand up' }], summary: 'oat milk trending' };
const competitorFixture = { cadence: 'daily', themes: ['seasonal'], hooks: ['limited time'], gaps: ['no loyalty'], recommendations: ['launch loyalty'], campaignSignal: true, signalSummary: 'competitor launched a summer promo burst', summary: 'active competitor' };

const transport: LlmTransport = async ({ messages }) => {
  // structuredComplete prepends its own JSON-instruction system message, so match
  // across all message content to find the arm's prompt.
  const sys = messages.map((m) => m.content).join(' ');
  const data = sys.includes('market research')
    ? marketFixture
    : sys.includes('trend analyst')
      ? trendFixture
      : competitorFixture;
  return { text: JSON.stringify(data), usage: { promptTokens: 10, completionTokens: 10 }, model: 'test-model' };
};

let db: Db;
let deps: IntelArmDeps;
const T = randomUUID();

beforeAll(async () => {
  db = createDb(loadConfig());
  await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Aurora Coffee', industry: 'specialty coffee' });
    await tx.insert(tenantProfiles).values({ tenantId: T, audience: 'local cafe-goers' });
  });
  deps = {
    db,
    llm: new LlmClient({ transport, sleep: async () => {} }),
    search: new FixtureSearchProvider({ '*': [{ title: 'Coffee trends 2026', url: 'https://ex.com/coffee', snippet: 'cold brew demand up' }] }),
    models: { fast: 'f', balanced: 'b', deep: 'd' },
  };
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM competitor_alerts WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM intel_snapshots WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM competitors WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenant_profiles WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('RESEARCH arms (Tasks 1.2–1.4)', () => {
  it('market arm produces a cited market snapshot', async () => {
    const res = await runMarketArm(deps, T);
    expect(res.arm).toBe('market');
    expect(res.citations).toEqual(['https://ex.com/coffee']);
    expect(res.data.keywords.length).toBeGreaterThan(0);
    const rows = await db.withTenant(T, (tx) =>
      tx.select().from(intelSnapshots).where(eq(intelSnapshots.type, 'market')),
    );
    expect(rows[0]!.citations.length).toBeGreaterThan(0);
  });

  it('market arm learns from the tenant website: page text reaches the prompt, url is cited', async () => {
    const T2 = randomUUID();
    await db.withTenant(T2, async (tx) => {
      await tx.insert(tenants).values({ id: T2, name: 'Mehrab Alquran', industry: 'islamic decor' });
      await tx.insert(tenantProfiles).values({
        tenantId: T2,
        audience: 'mosques and gift buyers',
        website: 'https://mehrab-alquran.com',
      });
    });
    const prompts: string[] = [];
    const capturingTransport: LlmTransport = async ({ messages }) => {
      prompts.push(messages.map((m) => m.content).join('\n'));
      return { text: JSON.stringify(marketFixture), usage: { promptTokens: 10, completionTokens: 10 }, model: 'test-model' };
    };
    const d: IntelArmDeps = {
      ...deps,
      llm: new LlmClient({ transport: capturingTransport, sleep: async () => {} }),
      pageFetch: async () => ({
        status: 200,
        text: async () => '<h1>Mehrab Alquran</h1><p>Handcrafted prayer niches and islamic wall decor.</p>',
      }),
    };

    try {
      const res = await runMarketArm(d, T2);
      expect(res.citations).toContain('https://mehrab-alquran.com');
      const prompt = prompts.join('\n');
      expect(prompt).toContain('Handcrafted prayer niches and islamic wall decor.');
      // Website text rides inside the untrusted wrapper, never as instructions.
      expect(prompt).toContain('<untrusted_content>');
    } finally {
      await db.adminPool.query('DELETE FROM intel_snapshots WHERE tenant_id = $1', [T2]);
      await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T2]);
      await db.adminPool.query('DELETE FROM tenant_profiles WHERE tenant_id = $1', [T2]);
      await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T2]);
    }
  });

  it('market arm survives a dead website (research proceeds on search context)', async () => {
    const T3 = randomUUID();
    await db.withTenant(T3, async (tx) => {
      await tx.insert(tenants).values({ id: T3, name: 'Dead Site Co', industry: 'retail' });
      await tx.insert(tenantProfiles).values({ tenantId: T3, website: 'https://gone.example' });
    });
    const d: IntelArmDeps = {
      ...deps,
      pageFetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    try {
      const res = await runMarketArm(d, T3);
      expect(res.arm).toBe('market');
      expect(res.citations).toEqual(['https://ex.com/coffee']);
    } finally {
      await db.adminPool.query('DELETE FROM intel_snapshots WHERE tenant_id = $1', [T3]);
      await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T3]);
      await db.adminPool.query('DELETE FROM tenant_profiles WHERE tenant_id = $1', [T3]);
      await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T3]);
    }
  });

  it('trend arm produces a cited trend snapshot', async () => {
    const res = await runTrendArm(deps, T);
    expect(res.arm).toBe('trends');
    expect(res.citations!.length).toBeGreaterThan(0);
    expect(res.data.trends.length).toBeGreaterThan(0);
  });

  it('competitor arm analyzes and fires an alert on a detected campaign', async () => {
    const competitorId = await db.withTenant(T, async (tx) => {
      const [c] = await tx
        .insert(competitors)
        .values({ tenantId: T, name: 'Blue Bottle', url: 'https://bluebottle.example' })
        .returning({ id: competitors.id });
      return c!.id;
    });

    const res = await runCompetitorArm(deps, T, competitorId);
    expect(res.arm).toBe('competitors');
    expect(res.citations!.length).toBeGreaterThan(0);
    expect(res.alertId).toBeDefined();

    const alerts = await db.withTenant(T, (tx) =>
      tx
        .select()
        .from(competitorAlerts)
        .where(and(eq(competitorAlerts.competitorId, competitorId), eq(competitorAlerts.status, 'open'))),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.summary).toContain('summer promo');
  });

  it('competitor watch cycle analyzes watch-enabled competitors and emits watch_ran (Task 1.4b)', async () => {
    const out = await runCompetitorWatchCycle(deps, T);
    expect(out.analyzed).toBeGreaterThanOrEqual(1);
    expect(out.alerts).toBeGreaterThanOrEqual(1);
    const events = await db.withTenant(T, (tx) =>
      tx.select().from(systemEvents).where(eq(systemEvents.action, 'competitor.watch_ran')),
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

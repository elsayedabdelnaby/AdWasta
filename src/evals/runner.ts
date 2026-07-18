import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { researchRules, strategyRules, creationRules, measureRules, briefRules, type EvalRule, type EvalSnapshot } from './rules.js';

export interface NamedSnapshot {
  name: string;
  snapshot: EvalSnapshot;
}

export interface EvalCheck {
  fixture: string;
  rule: string;
  passed: boolean;
}

export interface EvalReport {
  results: EvalCheck[];
  passed: number;
  total: number;
  passRate: number;
}

export const PASS_THRESHOLD = 0.9;

/** Apply each applicable rule to each fixture; report the aggregate pass rate. */
export function evaluate(fixtures: NamedSnapshot[], rules: EvalRule[]): EvalReport {
  const results: EvalCheck[] = [];
  for (const { name, snapshot } of fixtures) {
    for (const rule of rules) {
      if (!rule.applies(snapshot)) continue;
      results.push({ fixture: name, rule: rule.name, passed: rule.check(snapshot) });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return { results, passed, total, passRate: total === 0 ? 1 : passed / total };
}

/** Load every *.json fixture in a directory (each file is an array of snapshots). */
export function loadFixtures(dir: string): NamedSnapshot[] {
  if (!existsSync(dir)) return [];
  const out: NamedSnapshot[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const arr = JSON.parse(readFileSync(join(dir, file), 'utf8')) as EvalSnapshot[];
    arr.forEach((snapshot, i) => out.push({ name: `${file}#${i}`, snapshot }));
  }
  return out;
}

export const RULES_BY_PILLAR: Record<string, EvalRule[]> = {
  research: researchRules,
  strategy: strategyRules,
  creation: creationRules,
  measure: measureRules,
  'daily-brief': briefRules,
};
export const ALL_PILLARS = Object.keys(RULES_BY_PILLAR);
export const REGRESSION_TOLERANCE = 0.05;

export interface PillarReport extends EvalReport {
  pillar: string;
  fixtures: number;
}

/** Evaluate one pillar's golden fixtures against its rules. */
export function runPillar(pillar: string): PillarReport {
  const rules = RULES_BY_PILLAR[pillar];
  if (!rules) throw new Error(`unknown pillar: ${pillar} (known: ${ALL_PILLARS.join(', ')})`);
  const fixtures = loadFixtures(join('evals', 'fixtures', pillar));
  const report = evaluate(fixtures, rules);
  return { ...report, pillar, fixtures: fixtures.length };
}

/** Record a pillar result to eval_runs and return the previous pass rate (baseline). */
async function recordAndBaseline(report: PillarReport): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  const pgMod = await import('pg');
  const drizzleMod = await import('drizzle-orm/node-postgres');
  const schema = await import('../db/schema/eval-runs.js');
  const { desc, eq } = await import('drizzle-orm');
  const pool = new pgMod.default.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzleMod.drizzle(pool);
    const prev = await db.select({ r: schema.evalRuns.passRate }).from(schema.evalRuns).where(eq(schema.evalRuns.pillar, report.pillar)).orderBy(desc(schema.evalRuns.createdAt)).limit(1);
    await db.insert(schema.evalRuns).values({ pillar: report.pillar, passed: report.passed, total: report.total, passRate: report.passRate.toFixed(4), fixtures: report.fixtures });
    return prev[0] ? Number(prev[0].r) : null;
  } finally {
    await pool.end();
  }
}

// CLI: `npm run evals:run` (all pillars) or `--pillar=research`. Exit 1 on <90%
// or a regression beyond tolerance vs the last recorded baseline.
const isMain = process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js');
if (isMain) {
  const arg = process.argv.find((a) => a.startsWith('--pillar='))?.split('=')[1];
  const pillars = !arg || arg === 'all' ? ALL_PILLARS : [arg];
  let failed = false;
  await (async () => {
    for (const pillar of pillars) {
      let report: PillarReport;
      try {
        report = runPillar(pillar);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
      const pct = (report.passRate * 100).toFixed(1);
      for (const r of report.results.filter((x) => !x.passed)) console.error(`FAIL ${r.fixture} :: ${r.rule}`);
      const baseline = await recordAndBaseline(report).catch(() => null);
      const regression = baseline !== null && report.passRate < baseline - REGRESSION_TOLERANCE;
      console.log(`${pillar}: ${report.passed}/${report.total} (${pct}%) over ${report.fixtures} fixtures${baseline !== null ? ` [baseline ${(baseline * 100).toFixed(1)}%]` : ''}${regression ? ' REGRESSION' : ''}`);
      if (report.passRate < PASS_THRESHOLD || regression) failed = true;
    }
  })();
  if (failed) {
    console.error(`FAILED: a pillar is below ${PASS_THRESHOLD * 100}% or regressed > ${REGRESSION_TOLERANCE * 100}%`);
    process.exit(1);
  }
  console.log('all evals passed');
}

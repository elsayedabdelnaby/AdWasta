import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { researchRules, strategyRules, type EvalRule, type EvalSnapshot } from './rules.js';

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

// CLI: `npm run evals:run -- --pillar=research`. Exit 1 if below the deploy gate.
const isMain = process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js');
if (isMain) {
  const pillar = process.argv.find((a) => a.startsWith('--pillar='))?.split('=')[1] ?? 'research';
  const RULES_BY_PILLAR: Record<string, typeof researchRules> = { research: researchRules, strategy: strategyRules };
  const rules = RULES_BY_PILLAR[pillar];
  if (!rules) {
    // eslint-disable-next-line no-console
    console.error(`unknown pillar: ${pillar} (known: ${Object.keys(RULES_BY_PILLAR).join(', ')})`);
    process.exit(1);
  }
  const dir = join('evals', 'fixtures', pillar);
  const fixtures = loadFixtures(dir);
  const report = evaluate(fixtures, rules);
  const pct = (report.passRate * 100).toFixed(1);
  for (const r of report.results.filter((x) => !x.passed)) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${r.fixture} :: ${r.rule}`);
  }
  // eslint-disable-next-line no-console
  console.log(`${pillar} evals: ${report.passed}/${report.total} (${pct}%) over ${fixtures.length} fixtures`);
  if (report.passRate < PASS_THRESHOLD) {
    // eslint-disable-next-line no-console
    console.error(`FAILED: pass rate ${pct}% < ${PASS_THRESHOLD * 100}%`);
    process.exit(1);
  }
}

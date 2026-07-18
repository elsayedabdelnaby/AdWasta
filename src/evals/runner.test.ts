import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { evaluate, loadFixtures, PASS_THRESHOLD } from './runner.js';
import { researchRules, strategyRules, creationRules, measureRules, type EvalSnapshot } from './rules.js';

const goodMarket: EvalSnapshot = { type: 'market', summary: 'ok', data: { keywords: ['cold brew'] }, citations: ['https://a'] };
const noCitations: EvalSnapshot = { type: 'market', summary: 'ok', data: { keywords: ['x'] }, citations: [] };
const noKeywords: EvalSnapshot = { type: 'market', summary: 'ok', data: {}, citations: ['https://a'] };

describe('eval runner (design §17)', () => {
  it('passes a well-formed snapshot on every applicable rule', () => {
    const report = evaluate([{ name: 'm', snapshot: goodMarket }], researchRules);
    expect(report.passRate).toBe(1);
  });

  it('fails the citations rule when citations are empty', () => {
    const report = evaluate([{ name: 'm', snapshot: noCitations }], researchRules);
    const fail = report.results.find((r) => r.rule === 'citations-non-empty');
    expect(fail?.passed).toBe(false);
  });

  it('fails the keyword rule when a market snapshot has no keywords', () => {
    const report = evaluate([{ name: 'm', snapshot: noKeywords }], researchRules);
    const fail = report.results.find((r) => r.rule === 'market-has-keywords');
    expect(fail?.passed).toBe(false);
  });

  it('the golden research fixtures clear the ≥90% deploy gate', () => {
    const fixtures = loadFixtures(join('evals', 'fixtures', 'research'));
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    const report = evaluate(fixtures, researchRules);
    expect(report.passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  it('the golden strategy fixtures clear the ≥90% deploy gate (both audience models)', () => {
    const fixtures = loadFixtures(join('evals', 'fixtures', 'strategy'));
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    const report = evaluate(fixtures, strategyRules);
    expect(report.passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  it('the golden creation fixtures clear the ≥90% deploy gate', () => {
    const fixtures = loadFixtures(join('evals', 'fixtures', 'creation'));
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    const report = evaluate(fixtures, creationRules);
    expect(report.passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  it('the golden measure fixtures clear the ≥90% gate (citations + provisional)', () => {
    const fixtures = loadFixtures(join('evals', 'fixtures', 'measure'));
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    const report = evaluate(fixtures, measureRules);
    expect(report.passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });
});

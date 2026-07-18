// Deterministic eval rules (design §17). These are the day-one blocking gate —
// LLM-judge scoring is advisory until ≥25 fixtures exist. A snapshot without
// citations fails and is never shown to Content (design §12).

export interface EvalSnapshot {
  type: string; // market|trend|competitor (research) or icp|personas|angles|plan (strategy)
  summary: string;
  data: Record<string, unknown>;
  citations: string[];
}

export interface EvalRule {
  name: string;
  applies: (s: EvalSnapshot) => boolean;
  check: (s: EvalSnapshot) => boolean;
}

const isNonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

export const researchRules: EvalRule[] = [
  {
    name: 'citations-non-empty',
    applies: () => true,
    check: (s) => isNonEmptyArray(s.citations),
  },
  {
    name: 'summary-present',
    applies: () => true,
    check: (s) => typeof s.summary === 'string' && s.summary.trim().length > 0,
  },
  {
    name: 'market-has-keywords',
    applies: (s) => s.type === 'market',
    check: (s) => isNonEmptyArray(s.data.keywords),
  },
  {
    name: 'trend-has-trends',
    applies: (s) => s.type === 'trend',
    check: (s) => isNonEmptyArray(s.data.trends),
  },
  {
    name: 'competitor-cites-sources',
    applies: (s) => s.type === 'competitor',
    check: (s) => isNonEmptyArray(s.citations),
  },
];

export const strategyRules: EvalRule[] = [
  {
    name: 'icp-fields-present',
    applies: (s) => s.type === 'icp',
    check: (s) => isNonEmptyArray(s.data.segments) && Array.isArray(s.data.objections),
  },
  {
    name: 'persona-count-2-to-4',
    applies: (s) => s.type === 'personas',
    check: (s) => Array.isArray(s.data.personas) && s.data.personas.length >= 2 && s.data.personas.length <= 4,
  },
  {
    name: 'at-least-3-angles',
    applies: (s) => s.type === 'angles',
    check: (s) => Array.isArray(s.data.angles) && s.data.angles.length >= 3,
  },
  {
    name: 'plan-lists-email-and-social',
    applies: (s) => s.type === 'plan',
    check: (s) =>
      Array.isArray(s.data.channels) &&
      (s.data.channels as unknown[]).includes('email') &&
      (s.data.channels as unknown[]).includes('social'),
  },
];

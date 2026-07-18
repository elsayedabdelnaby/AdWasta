// Deterministic eval rules (design §17). These are the day-one blocking gate —
// LLM-judge scoring is advisory until ≥25 fixtures exist. A snapshot without
// citations fails and is never shown to Content (design §12).

export interface EvalSnapshot {
  type: 'market' | 'trend' | 'competitor';
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

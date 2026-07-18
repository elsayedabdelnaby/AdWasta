import { describe, it, expect } from 'vitest';
import {
  interactions,
  engagementRate,
  ctr,
  openRate,
  computeItemStats,
  rollingBaseline,
  deltaVsBaseline,
  groupBy,
  summarizeGroup,
  MIN_SAMPLE,
  type MetricRow,
} from './stats.js';

const m = (over: Partial<MetricRow>): MetricRow => ({ id: 'x', ...over });

describe('deterministic stats (design §12.2 — the LLM NEVER does this arithmetic)', () => {
  it('sums interactions and computes engagement rate over reach', () => {
    const row = m({ reach: 100, likes: 5, comments: 3, shares: 1, saves: 1 });
    expect(interactions(row)).toBe(10);
    expect(engagementRate(row)).toBeCloseTo(0.1, 6);
  });

  it('returns null engagement when reach is missing or zero', () => {
    expect(engagementRate(m({ reach: 0, likes: 5 }))).toBeNull();
    expect(engagementRate(m({ likes: 5 }))).toBeNull();
  });

  it('computes CTR and open rate over impressions', () => {
    expect(ctr(m({ impressions: 1000, clicks: 20 }))).toBeCloseTo(0.02, 6);
    expect(openRate(m({ impressions: 500, opens: 125 }))).toBeCloseTo(0.25, 6);
    expect(ctr(m({ clicks: 20 }))).toBeNull();
  });

  it('computeItemStats bundles the per-item numbers', () => {
    const s = computeItemStats(m({ id: 'p1', reach: 200, impressions: 400, likes: 10, comments: 6, clicks: 8 }));
    expect(s.itemId).toBe('p1');
    expect(s.engagementRate).toBeCloseTo(0.08, 6);
    expect(s.ctr).toBeCloseTo(0.02, 6);
  });

  it('rolling baseline is mean + population stdev with a noise band', () => {
    const b = rollingBaseline([0.1, 0.2, 0.3]);
    expect(b.mean).toBeCloseTo(0.2, 6);
    expect(b.stdev).toBeCloseTo(0.081649, 5);
    expect(b.noiseBand[0]).toBeCloseTo(0.2 - 0.081649, 5);
    expect(b.noiseBand[1]).toBeCloseTo(0.2 + 0.081649, 5);
  });

  it('delta vs baseline gives absolute and z-score', () => {
    const b = rollingBaseline([0.1, 0.2, 0.3]);
    const d = deltaVsBaseline(0.3, b);
    expect(d.absolute).toBeCloseTo(0.1, 6);
    expect(d.z).toBeCloseTo(0.1 / 0.081649, 4);
  });

  it('groups items and flags min-sample sufficiency (n >= 5)', () => {
    expect(MIN_SAMPLE).toBe(5);
    const items = [
      { angle: 'A', rate: 0.1 },
      { angle: 'A', rate: 0.2 },
      { angle: 'A', rate: 0.3 },
      { angle: 'A', rate: 0.2 },
      { angle: 'A', rate: 0.2 },
      { angle: 'B', rate: 0.05 },
    ];
    const groups = groupBy(items, (i) => i.angle);
    const a = summarizeGroup('A', groups.get('A')!.map((i) => i.rate));
    const b = summarizeGroup('B', groups.get('B')!.map((i) => i.rate));
    expect(a.n).toBe(5);
    expect(a.sufficient).toBe(true);
    expect(a.mean).toBeCloseTo(0.2, 6);
    expect(b.n).toBe(1);
    expect(b.sufficient).toBe(false); // below min sample -> provisional
  });
});

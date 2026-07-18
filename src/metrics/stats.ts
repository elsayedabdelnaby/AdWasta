// Deterministic performance stats (design §12.2). Pure functions, unit-tested.
// The Analyst arm (LLM) only INTERPRETS this output — it never does the arithmetic.

export interface MetricRow {
  id: string;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  clicks?: number | null;
  saves?: number | null;
  videoViews?: number | null;
  opens?: number | null;
}

const n = (v: number | null | undefined): number => v ?? 0;

export function interactions(m: MetricRow): number {
  return n(m.likes) + n(m.comments) + n(m.shares) + n(m.saves);
}

/** interactions ÷ reach; null when reach is missing/zero. */
export function engagementRate(m: MetricRow): number | null {
  const reach = n(m.reach);
  return reach > 0 ? interactions(m) / reach : null;
}

/** clicks ÷ impressions; null when impressions missing/zero. */
export function ctr(m: MetricRow): number | null {
  const imp = n(m.impressions);
  return imp > 0 ? n(m.clicks) / imp : null;
}

/** opens ÷ impressions; null when impressions missing/zero. */
export function openRate(m: MetricRow): number | null {
  const imp = n(m.impressions);
  return imp > 0 ? n(m.opens) / imp : null;
}

export interface ItemStats {
  itemId: string;
  interactions: number;
  reach: number;
  impressions: number;
  engagementRate: number | null;
  ctr: number | null;
  openRate: number | null;
}

export function computeItemStats(m: MetricRow): ItemStats {
  return {
    itemId: m.id,
    interactions: interactions(m),
    reach: n(m.reach),
    impressions: n(m.impressions),
    engagementRate: engagementRate(m),
    ctr: ctr(m),
    openRate: openRate(m),
  };
}

export interface Baseline {
  mean: number;
  stdev: number; // population standard deviation
  noiseBand: [number, number];
  n: number;
}

export function rollingBaseline(values: number[]): Baseline {
  const count = values.length;
  if (count === 0) return { mean: 0, stdev: 0, noiseBand: [0, 0], n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / count;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
  const stdev = Math.sqrt(variance);
  return { mean, stdev, noiseBand: [mean - stdev, mean + stdev], n: count };
}

export interface Delta {
  absolute: number;
  z: number; // standard scores; 0 when stdev is 0
}

export function deltaVsBaseline(value: number, baseline: Baseline): Delta {
  const absolute = value - baseline.mean;
  return { absolute, z: baseline.stdev > 0 ? absolute / baseline.stdev : 0 };
}

export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

export const MIN_SAMPLE = 5;

export interface GroupSummary {
  key: string;
  n: number;
  mean: number;
  sufficient: boolean; // n >= MIN_SAMPLE, else the insight is provisional
}

export function summarizeGroup(key: string, rates: number[]): GroupSummary {
  const b = rollingBaseline(rates);
  return { key, n: rates.length, mean: b.mean, sufficient: rates.length >= MIN_SAMPLE };
}

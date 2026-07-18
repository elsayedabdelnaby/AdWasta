import { describe, expect, it } from 'vitest';
import { relativeTime, titleCase, usd } from './format';

describe('usd', () => {
  it('formats to cents by default', () => {
    expect(usd(1.5)).toBe('$1.50');
    expect(usd('2')).toBe('$2.00');
  });
  it('shows 4 dp for sub-cent costs', () => {
    expect(usd(0.0034)).toBe('$0.0034');
  });
  it('handles null/NaN as zero', () => {
    expect(usd(null)).toBe('$0.00');
    expect(usd('abc')).toBe('$0.00');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-18T12:00:00Z').getTime();
  it('renders seconds/minutes/hours/days ago', () => {
    expect(relativeTime('2026-07-18T11:59:30Z', now)).toBe('30s ago');
    expect(relativeTime('2026-07-18T11:30:00Z', now)).toBe('30m ago');
    expect(relativeTime('2026-07-18T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-07-16T12:00:00Z', now)).toBe('2d ago');
  });
  it('returns em dash for missing/invalid input', () => {
    expect(relativeTime(null, now)).toBe('—');
    expect(relativeTime('nonsense', now)).toBe('—');
  });
});

describe('titleCase', () => {
  it('humanizes snake/kebab identifiers', () => {
    expect(titleCase('daily_strategist')).toBe('Daily Strategist');
    expect(titleCase('copy-pack')).toBe('Copy Pack');
    expect(titleCase('')).toBe('');
  });
});

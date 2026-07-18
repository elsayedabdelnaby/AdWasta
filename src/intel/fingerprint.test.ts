import { describe, it, expect } from 'vitest';
import { simhash, hammingDistance, isNearDuplicate } from './fingerprint.js';

const base =
  'Aurora Coffee launches a new nitro cold brew line for the summer season with three signature flavors available at all downtown locations starting next week';
const near =
  'Aurora Coffee launches a new nitro cold brew line for the summer season with three signature flavors available at all downtown cafes starting next week';
const far =
  'The city council approved a new zoning ordinance affecting industrial permits and quarterly property tax assessments for the next fiscal year';

describe('SimHash fingerprint (ADR-003)', () => {
  it('is deterministic and 16 hex chars (64-bit)', () => {
    expect(simhash(base)).toBe(simhash(base));
    expect(simhash(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('identical text has Hamming distance 0', () => {
    expect(hammingDistance(simhash(base), simhash(base))).toBe(0);
  });

  it('a near-identical edit is much closer than unrelated text', () => {
    const dNear = hammingDistance(simhash(base), simhash(near));
    const dFar = hammingDistance(simhash(base), simhash(far));
    expect(dNear).toBeLessThan(dFar);
    expect(dNear).toBeLessThanOrEqual(3); // near-duplicate band
  });

  it('isNearDuplicate flags unchanged content and rejects unrelated content', () => {
    expect(isNearDuplicate(simhash(base), simhash(base))).toBe(true);
    expect(isNearDuplicate(simhash(base), simhash(far))).toBe(false);
  });

  it('hammingDistance counts differing bits correctly', () => {
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });
});

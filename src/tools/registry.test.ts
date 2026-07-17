import { describe, it, expect } from 'vitest';
import { getToolsForArm, validateToolArgs, getTool } from './registry.js';

describe('lazy tool registry (design §9)', () => {
  it('returns the exact tool subset for the Market arm', () => {
    const names = getToolsForArm('market').map((t) => t.name);
    expect(names).toEqual(['search_serp', 'search_web', 'query_intel_history']);
  });

  it('gives different arms different tool subsets', () => {
    const market = new Set(getToolsForArm('market').map((t) => t.name));
    const strategy = new Set(getToolsForArm('strategy').map((t) => t.name));
    expect(market).not.toEqual(strategy);
    // Strategy's write tools are not exposed to Market
    expect(market.has('write_icp')).toBe(false);
    expect(strategy.has('write_icp')).toBe(true);
  });

  it('exposes generate_image to Content only when image_gen_enabled', () => {
    const off = getToolsForArm('content', { imageGenEnabled: false }).map((t) => t.name);
    const on = getToolsForArm('content', { imageGenEnabled: true }).map((t) => t.name);
    expect(off).not.toContain('generate_image');
    expect(on).toContain('generate_image');
  });

  it('returns an empty set for an unknown arm', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(getToolsForArm('nonsense')).toEqual([]);
  });

  it('validates tool arguments against the tool schema before execute', () => {
    expect(() => validateToolArgs('search_serp', { query: 'best coffee' })).not.toThrow();
    expect(() => validateToolArgs('search_serp', { query: '' })).toThrow();
    expect(() => validateToolArgs('search_serp', {})).toThrow();
  });

  it('throws on an unknown tool name', () => {
    expect(() => validateToolArgs('no_such_tool', {})).toThrow();
    expect(getTool('no_such_tool')).toBeUndefined();
  });
});

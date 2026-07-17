import { describe, it, expect } from 'vitest';
import { resolveAdapter, type ConnectionFlags } from './registry.js';

const base: ConnectionFlags = {
  publishMode: 'copy_pack',
  apiPublishEnabled: false,
  browserPublishEnabled: false,
};

describe('resolveAdapter (design §10, ADR-001)', () => {
  it('defaults to the live copy_pack adapter', () => {
    const a = resolveAdapter('facebook', base);
    expect(a.mode).toBe('copy_pack');
    expect(a.platform).toBe('facebook');
  });

  it('copy_pack adapter is always healthy (no credentials needed)', async () => {
    const a = resolveAdapter('facebook', base);
    expect((await a.healthCheck('t1')).healthy).toBe(true);
  });

  it('returns the api stub when publish_mode=api AND api_publish_enabled', () => {
    const a = resolveAdapter('facebook', { ...base, publishMode: 'api', apiPublishEnabled: true });
    expect(a.mode).toBe('api');
  });

  it('the api stub is unhealthy and refuses to publish (scaffold only, Phase 8)', async () => {
    const a = resolveAdapter('facebook', { ...base, publishMode: 'api', apiPublishEnabled: true });
    expect((await a.healthCheck('t1')).healthy).toBe(false);
    await expect(a.publishPost!({ draftId: 'd1' })).rejects.toThrow();
  });

  it('refuses api mode when the flag is off (respects flags)', () => {
    expect(() => resolveAdapter('facebook', { ...base, publishMode: 'api', apiPublishEnabled: false })).toThrow();
  });

  it('refuses browser publishing entirely — deferred post-v1 (ADR-001)', () => {
    expect(() => resolveAdapter('facebook', { ...base, browserPublishEnabled: true })).toThrow(/ADR-001|browser/i);
    // even if someone sets the reserved mode value directly
    expect(() =>
      resolveAdapter('facebook', { ...base, publishMode: 'browser' as unknown as 'api' }),
    ).toThrow(/ADR-001|browser/i);
  });
});

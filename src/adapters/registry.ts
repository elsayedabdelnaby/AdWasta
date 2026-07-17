import type { PlatformAdapter, PublishMode } from './types.js';
import { makeCopyPackAdapter } from './copy-pack/adapter.js';
import { makeApiStubAdapter } from './api/stub.js';

export const SUPPORTED_PLATFORMS = ['facebook', 'twitter', 'instagram', 'linkedin', 'email'] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export interface ConnectionFlags {
  publishMode: PublishMode;
  apiPublishEnabled: boolean;
  /** Reserved (ADR-001). Always false in v1; setting it true is refused. */
  browserPublishEnabled: boolean;
}

/**
 * Pick the execution adapter for a platform, honoring the connection flags
 * (Task 0.6). Copy pack is the default live path; API requires its flag; browser
 * publishing is refused outright — deferred post-v1 (ADR-001).
 */
export function resolveAdapter(platform: string, flags: ConnectionFlags): PlatformAdapter {
  if (flags.browserPublishEnabled || (flags.publishMode as string) === 'browser') {
    throw new Error('browser publishing is deferred post-v1 (ADR-001) — not available');
  }
  if (flags.publishMode === 'api') {
    if (!flags.apiPublishEnabled) {
      throw new Error('api publish mode requires api_publish_enabled');
    }
    return makeApiStubAdapter(platform);
  }
  return makeCopyPackAdapter(platform);
}

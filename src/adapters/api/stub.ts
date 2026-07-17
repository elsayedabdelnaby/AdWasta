import type { PlatformAdapter } from '../types.js';
import { getCredentialRequirements } from '../../credentials/schemas/index.js';

const SCAFFOLD_MSG = 'API adapter is a scaffold — activation is config + credentials only (Phase 8)';

/**
 * API adapter stub (design §21, ADR-002 Decision 2 defers real API publish to v2).
 * Fully scaffolded: it validates credentials against the platform schema and
 * reports health, but write actions refuse until a real adapter replaces it.
 */
export function makeApiStubAdapter(platform: string): PlatformAdapter {
  return {
    platform,
    mode: 'api',
    async validateCredentials(creds) {
      const req = getCredentialRequirements(platform);
      if (!req) return { valid: false, error: `no credential schema for ${platform}` };
      const parsed = req.schema.safeParse(creds);
      return parsed.success
        ? { valid: true }
        : { valid: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
    },
    async healthCheck() {
      return { healthy: false, detail: SCAFFOLD_MSG };
    },
    async publishPost() {
      throw new Error(SCAFFOLD_MSG);
    },
    async replyToComment() {
      throw new Error(SCAFFOLD_MSG);
    },
    async replyToMessage() {
      throw new Error(SCAFFOLD_MSG);
    },
  };
}

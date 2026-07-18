import type { PlatformAdapter } from '../types.js';
import { facebookCredentialsSchema } from '../../credentials/schemas/facebook.js';

// Facebook Graph API adapter (Task 8.1). Scaffold in v1 — interface + credential
// schema + health check; write actions refuse until activation (config + creds).
// Real HTTP lands in R3 with no interface rewrite (design §21).
const NOT_ACTIVE = 'Facebook Graph API adapter — enable api_publish_enabled + save credentials (Phase 8 scaffold)';

export function makeFacebookAdapter(): PlatformAdapter {
  return {
    platform: 'facebook',
    mode: 'api',
    async validateCredentials(creds) {
      const p = facebookCredentialsSchema.safeParse(creds);
      return p.success ? { valid: true } : { valid: false, error: p.error.issues.map((i) => i.message).join('; ') };
    },
    async healthCheck() {
      return { healthy: false, detail: NOT_ACTIVE };
    },
    async publishPost() {
      throw new Error(NOT_ACTIVE);
    },
    async replyToComment() {
      throw new Error(NOT_ACTIVE);
    },
    async replyToMessage() {
      throw new Error(NOT_ACTIVE);
    },
  };
}

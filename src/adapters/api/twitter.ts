import type { PlatformAdapter } from '../types.js';
import { twitterCredentialsSchema } from '../../credentials/schemas/twitter.js';

// X (Twitter) API v2 adapter (Task 8.2). Scaffold — same interface as Facebook;
// OAuth 1.0a user-context credentials. Refuses writes until activation.
const NOT_ACTIVE = 'X API v2 adapter — enable api_publish_enabled + save OAuth credentials (Phase 8 scaffold)';

export function makeTwitterAdapter(): PlatformAdapter {
  return {
    platform: 'twitter',
    mode: 'api',
    async validateCredentials(creds) {
      const p = twitterCredentialsSchema.safeParse(creds);
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

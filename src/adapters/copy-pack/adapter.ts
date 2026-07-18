import type { PlatformAdapter } from '../types.js';

/**
 * Copy-pack adapter (design §10, default). Zero account risk: it produces
 * ready-to-paste output and never touches a platform API, so it needs no
 * credentials and is always healthy. Actual copy-pack formatting lands in Phase 3.
 */
export function makeCopyPackAdapter(platform: string): PlatformAdapter {
  return {
    platform,
    mode: 'copy_pack',
    async validateCredentials() {
      return { valid: true };
    },
    async healthCheck() {
      return { healthy: true, detail: 'copy pack requires no credentials' };
    },
    async publishPost(input) {
      // Copy pack is human-driven: nothing is sent. Marks the item ready to paste.
      return { status: 'ready', mode: 'copy_pack', draftId: input.draftId };
    },
    async replyToComment(input) {
      return { status: 'ready', mode: 'copy_pack', engagementItemId: input.engagementItemId };
    },
    async replyToMessage(input) {
      return { status: 'ready', mode: 'copy_pack', engagementItemId: input.engagementItemId };
    },
  };
}

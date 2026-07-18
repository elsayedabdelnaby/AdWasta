import type { ImageAdapter, ImageGenerateInput } from './types.js';

// Placeholder adapter used when image gen is off / no credentials. Returns
// deterministic placeholder URLs so the copy-pack + approval flow works end-to-end
// without a real image provider or cost.
export class StubImageAdapter implements ImageAdapter {
  provider = 'stub' as const;
  async validateCredentials() {
    return { valid: true as const };
  }
  async healthCheck() {
    return { healthy: true, detail: 'stub image adapter (no real generation)' };
  }
  async generate(input: ImageGenerateInput) {
    const n = Math.max(1, input.variants);
    const assets = Array.from({ length: n }, (_, i) => ({
      url: `https://placehold.co/1024x1024?text=variant+${i}`,
      variantIndex: i,
    }));
    return { assets, costUsd: 0 };
  }
}

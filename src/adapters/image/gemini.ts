import type { ImageAdapter, ImageGenerateInput, GeneratedAssetOut } from './types.js';

// Gemini image adapter scaffold (design §8.2, ADR-003). SDK is @google/genai
// (@google/generative-ai deprecated Nov 30 2025); the exact call shape must be
// confirmed against live docs before wiring — hence an injected `client` seam
// rather than a hard SDK dependency in v1. Variants are N SEQUENTIAL calls.
export type GeminiImageClient = (input: {
  model: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  brandRefUrls: string[];
}) => Promise<{ url: string; costUsd: number }>;

const NOT_CONFIGURED = 'Gemini image client not configured — set GOOGLE_AI_API_KEY and wire @google/genai (design §8.2)';

export class GeminiImageAdapter implements ImageAdapter {
  provider = 'gemini' as const;
  constructor(private readonly client?: GeminiImageClient) {}

  async validateCredentials(creds: unknown) {
    const ok = typeof creds === 'object' && creds !== null && 'apiKey' in creds;
    return ok ? { valid: true as const } : { valid: false as const, error: 'apiKey required' };
  }

  async healthCheck() {
    return this.client
      ? { healthy: true }
      : { healthy: false, detail: NOT_CONFIGURED };
  }

  async generate(input: ImageGenerateInput): Promise<{ assets: GeneratedAssetOut[]; costUsd: number }> {
    if (!this.client) throw new Error(NOT_CONFIGURED);
    const assets: GeneratedAssetOut[] = [];
    let costUsd = 0;
    // N sequential calls — there is no native multi-candidate parameter (ADR-003).
    for (let i = 0; i < Math.max(1, input.variants); i++) {
      const r = await this.client({
        model: input.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution ?? '1K',
        brandRefUrls: input.brandRefUrls ?? [],
      });
      assets.push({ url: r.url, variantIndex: i });
      costUsd += r.costUsd;
    }
    return { assets, costUsd };
  }
}

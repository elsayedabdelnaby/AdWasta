import type { ValidationResult, HealthResult } from '../types.js';

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

export interface ImageGenerateInput {
  prompt: string;
  model: string; // gemini-3-pro-image | gemini-3.1-flash-image | ...
  aspectRatio: AspectRatio;
  resolution?: '1K' | '2K' | '4K'; // default 1K (1024x1024) — ADR-003
  brandRefUrls?: string[];
  variants: number; // 1-3 => N SEQUENTIAL calls (no native multi-candidate param)
}

export interface GeneratedAssetOut {
  url: string;
  variantIndex: number;
}

// design §8.2. "Nano Banana" is a Gemini model, not a provider (ADR-003).
export interface ImageAdapter {
  provider: 'gemini' | 'stub';
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  healthCheck(tenantId: string): Promise<HealthResult>;
  generate(input: ImageGenerateInput): Promise<{ assets: GeneratedAssetOut[]; costUsd: number }>;
}

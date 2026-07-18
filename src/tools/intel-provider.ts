import type { ValidationResult } from '../adapters/types.js';

// Optional paid intel provider (Apify / Bright Data / official APIs) behind a
// per-tenant credential + monthly cost cap (design §12 tier 3). Scaffold only in
// v1 — NO social scraping in our code. Activation is config + credentials (R2+).
export interface IntelProviderItem {
  source: string;
  text: string;
  url?: string;
}

export interface IntelProviderAdapter {
  name: string;
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  fetchData(input: { query: string; tenantId: string }): Promise<{ items: IntelProviderItem[]; costUsd: number }>;
}

const NOT_CONFIGURED = 'intel provider is a scaffold — enable with credentials (R2+, design §12)';

export class StubIntelProvider implements IntelProviderAdapter {
  name = 'stub';
  async validateCredentials(): Promise<ValidationResult> {
    return { valid: false, error: NOT_CONFIGURED };
  }
  async fetchData(): Promise<{ items: IntelProviderItem[]; costUsd: number }> {
    throw new Error(NOT_CONFIGURED);
  }
}

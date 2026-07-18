import { z } from 'zod';

/** A base64 string that decodes to exactly 32 bytes (AES-256 key material). */
const base64Key32 = z.string().refine(
  (v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  },
  { message: 'CREDENTIALS_MASTER_KEY must be base64 encoding exactly 32 bytes' },
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // Comma-separated first-party origins allowed to make credentialed requests.
  // Never reflect an arbitrary Origin with credentialed CORS (CSRF/cred-read risk).
  CORS_ORIGINS: z.string().default('http://localhost:8080,http://localhost:5173'),

  CREDENTIALS_MASTER_KEY: base64Key32,

  AUTH_PROVIDER: z.enum(['dev', 'workos']).optional(),
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_COOKIE_PASSWORD: z.string().optional(),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  MODEL_FAST: z.string().default('openai/gpt-4o-mini'),
  MODEL_BALANCED: z.string().default('openai/gpt-4o'),
  MODEL_DEEP: z.string().default('anthropic/claude-sonnet-4'),
  BRAVE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  // Self-hosted SearXNG instance (keyless). e.g. http://searxng:8080
  SEARXNG_URL: z.string().optional(),

  // Image generation (Phase 3, ADR-003). Optional: with no key the app falls
  // back to the placeholder stub adapter. GEMINI_API_KEY is preferred; the SDK
  // also accepts the GOOGLE_AI_API_KEY name.
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  // Strip an inline "# comment" / trailing whitespace some .env parsers leave in
  // place, so a model like "gemini-3-pro-image   # ~$0.13" resolves cleanly.
  IMAGE_GEN_MODEL: z
    .string()
    .default('gemini-2.5-flash-image')
    .transform((v) => v.split('#')[0]!.trim().split(/\s+/)[0] || 'gemini-2.5-flash-image'),

  DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(10),
  MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(50),
  MAX_RUN_COST_USD: z.coerce.number().nonnegative().default(2),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  AUTH_PROVIDER: 'dev' | 'workos';
};

/**
 * Parse and validate configuration from an environment-like source.
 * Pure: pass an explicit source in tests; defaults to process.env in the app.
 * Throws a ZodError (with readable messages) on invalid config — fail fast at boot.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.parse(source);
  const authProvider: 'dev' | 'workos' =
    parsed.AUTH_PROVIDER ?? (parsed.WORKOS_API_KEY ? 'workos' : 'dev');
  return { ...parsed, AUTH_PROVIDER: authProvider };
}

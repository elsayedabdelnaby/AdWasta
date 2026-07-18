import type { ZodType } from 'zod';
import type { TraceStep } from '../db/schema/agent-traces.js';
import { classifyError, LLMRecoverableError } from '../harness/error-handler.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface TransportResult {
  text: string;
  usage: ChatUsage;
  model: string;
}

export type LlmTransport = (req: {
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl: string;
}) => Promise<TransportResult>;

export interface PriceRate {
  input: number; // USD per 1M prompt tokens
  output: number; // USD per 1M completion tokens
}

/** Minimal trace surface so the client can log without a DB in unit tests. */
export interface StepSink {
  addStep(step: TraceStep): Promise<void>;
}

export interface LlmClientOptions {
  baseUrl?: string;
  apiKey?: string;
  transport?: LlmTransport;
  prices?: Record<string, PriceRate>;
  promptVersion?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
  costUsd: number;
  model: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Real OpenRouter HTTP transport (used when none is injected). */
const httpTransport: LlmTransport = async ({ model, messages, apiKey, baseUrl }) => {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`openrouter ${res.status}`), { status: res.status });
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  return {
    text: json.choices[0]?.message?.content ?? '',
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
    model: json.model ?? model,
  };
};

/**
 * OpenRouter chat wrapper (Task 0.5.1): transient retry (max 2), cost accounting
 * from a price table, and per-call logging to the active trace with prompt_version.
 * The transport is injectable so tests never hit the network.
 */
export class LlmClient {
  private readonly transport: LlmTransport;
  private readonly prices: Record<string, PriceRate>;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: LlmClientOptions = {}) {
    this.transport = opts.transport ?? httpTransport;
    this.prices = opts.prices ?? {};
    this.maxRetries = opts.maxRetries ?? 2;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private cost(model: string, usage: ChatUsage): number {
    const rate = this.prices[model] ?? { input: 0, output: 0 };
    return (usage.promptTokens / 1e6) * rate.input + (usage.completionTokens / 1e6) * rate.output;
  }

  async chat(args: { model: string; messages: ChatMessage[]; trace?: StepSink }): Promise<ChatResult> {
    let attempt = 0;
    // total attempts = 1 + maxRetries
    for (;;) {
      const started = Date.now();
      try {
        const r = await this.transport({
          model: args.model,
          messages: args.messages,
          apiKey: this.opts.apiKey,
          baseUrl: this.opts.baseUrl ?? 'https://openrouter.ai/api/v1',
        });
        const costUsd = this.cost(r.model, r.usage);
        await args.trace?.addStep({
          action: 'llm.call',
          model: r.model,
          inputTokens: r.usage.promptTokens,
          outputTokens: r.usage.completionTokens,
          latencyMs: Date.now() - started,
          costUsd,
          promptVersion: this.opts.promptVersion,
        });
        return { text: r.text, usage: r.usage, costUsd, model: r.model };
      } catch (err) {
        const classified = classifyError(err);
        if (classified.retryable && attempt < this.maxRetries) {
          attempt += 1;
          await this.sleep(2 ** attempt * 100); // 200ms, 400ms
          continue;
        }
        await args.trace?.addStep({
          action: 'llm.call',
          model: args.model,
          latencyMs: Date.now() - started,
          error: classified.message,
        });
        throw classified;
      }
    }
  }

  /** Chat that must return JSON matching `schema`. Parse/validation failure is
   *  an LLM-recoverable error the caller can surface back to the model. */
  async structuredComplete<T>(args: {
    model: string;
    messages: ChatMessage[];
    schema: ZodType<T>;
    trace?: StepSink;
  }): Promise<T> {
    // Lead with the JSON instruction — several providers (Anthropic via OpenRouter)
    // only honor system content at the head, and ignore/reject a trailing one.
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Respond with ONLY a single JSON object. No prose, no code fences.' },
      ...args.messages,
    ];
    const res = await this.chat({ model: args.model, messages, trace: args.trace });
    const raw = extractJson(res.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new LLMRecoverableError(`model did not return valid JSON: ${res.text.slice(0, 200)}`);
    }
    const result = args.schema.safeParse(parsed);
    if (!result.success) {
      throw new LLMRecoverableError(
        `model JSON failed schema: ${result.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return result.data;
  }
}

/** Pull a JSON object out of a model response, tolerating ```json fences. */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

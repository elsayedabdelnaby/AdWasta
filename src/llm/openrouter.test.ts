import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { LlmClient, type LlmTransport } from './openrouter.js';
import { LLMRecoverableError } from '../harness/error-handler.js';
import type { TraceStep } from '../db/schema/agent-traces.js';

const prices = { 'm-balanced': { input: 1, output: 2 } }; // USD per 1M tokens
const noSleep = async () => {};

function fakeTrace() {
  const steps: TraceStep[] = [];
  return { steps, addStep: async (s: TraceStep) => void steps.push(s) };
}

describe('LlmClient.chat', () => {
  it('returns text, computes cost from usage, and logs a trace step', async () => {
    const transport: LlmTransport = async () => ({
      text: 'hello',
      usage: { promptTokens: 1_000_000, completionTokens: 500_000 },
      model: 'm-balanced',
    });
    const client = new LlmClient({ transport, prices, promptVersion: 'market@1.0.0', sleep: noSleep });
    const trace = fakeTrace();
    const res = await client.chat({ model: 'm-balanced', messages: [{ role: 'user', content: 'hi' }], trace });

    expect(res.text).toBe('hello');
    // 1M input @ $1 + 0.5M output @ $2 = 1 + 1 = 2
    expect(res.costUsd).toBeCloseTo(2, 6);
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]!.action).toBe('llm.call');
    expect(trace.steps[0]!.promptVersion).toBe('market@1.0.0');
    expect(trace.steps[0]!.costUsd).toBeCloseTo(2, 6);
  });

  it('retries a transient failure and then succeeds (max 2 retries)', async () => {
    const transport = vi
      .fn<LlmTransport>()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ text: 'ok', usage: { promptTokens: 0, completionTokens: 0 }, model: 'm-balanced' });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    const res = await client.chat({ model: 'm-balanced', messages: [{ role: 'user', content: 'x' }] });
    expect(res.text).toBe('ok');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on persistent transient errors', async () => {
    const transport = vi
      .fn<LlmTransport>()
      .mockRejectedValue(Object.assign(new Error('503'), { status: 503 }));
    const client = new LlmClient({ transport, prices, maxRetries: 2, sleep: noSleep });
    await expect(
      client.chat({ model: 'm-balanced', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });
});

describe('LlmClient.structuredComplete', () => {
  const schema = z.object({ sentiment: z.enum(['pos', 'neg']), score: z.number() });

  it('parses valid JSON into the schema', async () => {
    const transport: LlmTransport = async () => ({
      text: '```json\n{"sentiment":"pos","score":0.9}\n```',
      usage: { promptTokens: 10, completionTokens: 10 },
      model: 'm-balanced',
    });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    const out = await client.structuredComplete({
      model: 'm-balanced',
      messages: [{ role: 'user', content: 'classify' }],
      schema,
    });
    expect(out).toEqual({ sentiment: 'pos', score: 0.9 });
  });

  it('throws an LLM-recoverable error on invalid JSON', async () => {
    const transport: LlmTransport = async () => ({
      text: 'not json at all',
      usage: { promptTokens: 1, completionTokens: 1 },
      model: 'm-balanced',
    });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    await expect(
      client.structuredComplete({ model: 'm-balanced', messages: [{ role: 'user', content: 'x' }], schema }),
    ).rejects.toBeInstanceOf(LLMRecoverableError);
  });

  it('throws an LLM-recoverable error when JSON does not match the schema', async () => {
    const transport: LlmTransport = async () => ({
      text: '{"sentiment":"maybe","score":"high"}',
      usage: { promptTokens: 1, completionTokens: 1 },
      model: 'm-balanced',
    });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    await expect(
      client.structuredComplete({ model: 'm-balanced', messages: [{ role: 'user', content: 'x' }], schema }),
    ).rejects.toBeInstanceOf(LLMRecoverableError);
  });

  it('repairs a schema failure by feeding the validation errors back to the model', async () => {
    const transport = vi
      .fn<LlmTransport>()
      .mockResolvedValueOnce({
        text: '{"sentiment":"POS","score":"high"}',
        usage: { promptTokens: 1, completionTokens: 1 },
        model: 'm-balanced',
      })
      .mockResolvedValueOnce({
        text: '{"sentiment":"pos","score":0.9}',
        usage: { promptTokens: 1, completionTokens: 1 },
        model: 'm-balanced',
      });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    const out = await client.structuredComplete({
      model: 'm-balanced',
      messages: [{ role: 'user', content: 'classify' }],
      schema,
    });
    expect(out).toEqual({ sentiment: 'pos', score: 0.9 });
    expect(transport).toHaveBeenCalledTimes(2);

    // The repair turn must show the model its bad reply and the exact errors.
    const repairMessages = transport.mock.calls[1]![0].messages;
    const assistant = repairMessages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('"POS"');
    const lastUser = [...repairMessages].reverse().find((m) => m.role === 'user');
    expect(lastUser?.content).toMatch(/sentiment/);
    expect(lastUser?.content).toMatch(/corrected JSON/i);
  });

  it('gives up after one failed repair attempt', async () => {
    const transport = vi.fn<LlmTransport>().mockResolvedValue({
      text: '{"sentiment":"maybe","score":"high"}',
      usage: { promptTokens: 1, completionTokens: 1 },
      model: 'm-balanced',
    });
    const client = new LlmClient({ transport, prices, sleep: noSleep });
    await expect(
      client.structuredComplete({ model: 'm-balanced', messages: [{ role: 'user', content: 'x' }], schema }),
    ).rejects.toBeInstanceOf(LLMRecoverableError);
    expect(transport).toHaveBeenCalledTimes(2); // initial + 1 repair, then stop
  });
});

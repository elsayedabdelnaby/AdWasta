import { describe, it, expect, vi } from 'vitest';
import { LlmClient, type LlmTransport } from '../llm/openrouter.js';
import { judgeOutput } from './judge.js';

const models = { fast: 'm-fast', balanced: 'm-balanced', deep: 'm-deep' };

describe('LLM-as-judge (Task 10.2)', () => {
  it('always uses MODEL_DEEP (never the producer tier)', async () => {
    const transport = vi.fn<LlmTransport>(async () => ({ text: JSON.stringify({ score: 0.9, reason: 'on-brand' }), usage: { promptTokens: 1, completionTokens: 1 }, model: 'm-deep' }));
    const llm = new LlmClient({ transport, sleep: async () => {} });
    const verdict = await judgeOutput({ llm, models }, { output: 'a draft', criteria: 'on brand' });

    expect(transport.mock.calls[0]![0]!.model).toBe('m-deep'); // deep tier
    expect(verdict.pass).toBe(true);
    expect(verdict.score).toBeCloseTo(0.9, 6);
  });

  it('fails an output below the pass threshold', async () => {
    const transport: LlmTransport = async () => ({ text: JSON.stringify({ score: 0.4, reason: 'off-brand' }), usage: { promptTokens: 1, completionTokens: 1 }, model: 'm-deep' });
    const llm = new LlmClient({ transport, sleep: async () => {} });
    expect((await judgeOutput({ llm, models }, { output: 'x', criteria: 'y' })).pass).toBe(false);
  });
});

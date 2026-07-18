import { describe, it, expect, vi } from 'vitest';
import { runReactLoop, MAX_ARM_STEPS, type ReactAction } from './react-loop.js';
import { TransientError, UserFixableError } from './error-handler.js';

const noSleep = async () => {};

describe('runReactLoop (design §3, Task 0.5.2)', () => {
  it('defaults the hard cap to 10 steps', () => {
    expect(MAX_ARM_STEPS).toBe(10);
  });

  it('stops at the step cap when the policy never finishes', async () => {
    const decide = vi.fn(async (): Promise<ReactAction> => ({ type: 'tool', tool: 'noop', args: {} }));
    const out = await runReactLoop({
      decide,
      tools: { noop: async () => ({}) },
      maxSteps: 3,
      sleep: noSleep,
    });
    expect(out.stoppedAtCap).toBe(true);
    expect(decide).toHaveBeenCalledTimes(3);
    expect(out.steps).toHaveLength(3);
  });

  it('returns the final result when the policy finishes', async () => {
    let n = 0;
    const decide = async (): Promise<ReactAction> =>
      n++ === 0 ? { type: 'tool', tool: 'noop', args: {} } : { type: 'final', result: { ok: true } };
    const out = await runReactLoop({ decide, tools: { noop: async () => ({}) }, sleep: noSleep });
    expect(out.stoppedAtCap).toBe(false);
    expect(out.result).toEqual({ ok: true });
  });

  it('retries a transient tool error once, then observes success', async () => {
    const tool = vi
      .fn()
      .mockRejectedValueOnce(new TransientError('flaky'))
      .mockResolvedValueOnce({ data: 42 });
    let n = 0;
    const decide = async (): Promise<ReactAction> =>
      n++ === 0 ? { type: 'tool', tool: 'flaky', args: {} } : { type: 'final', result: 'done' };
    const out = await runReactLoop({ decide, tools: { flaky: tool }, sleep: noSleep });
    expect(tool).toHaveBeenCalledTimes(2);
    expect(out.steps[0]!.observation).toEqual({ data: 42 });
  });

  it('surfaces an unknown tool as an observation and keeps going', async () => {
    let n = 0;
    const decide = async (): Promise<ReactAction> =>
      n++ === 0 ? { type: 'tool', tool: 'ghost', args: {} } : { type: 'final', result: 'ok' };
    const out = await runReactLoop({ decide, tools: {}, sleep: noSleep });
    expect(out.steps[0]!.observation).toMatchObject({ error: expect.stringContaining('ghost') });
  });

  it('bubbles a user-fixable tool error out of the loop', async () => {
    const decide = async (): Promise<ReactAction> => ({ type: 'tool', tool: 'creds', args: {} });
    await expect(
      runReactLoop({
        decide,
        tools: {
          creds: async () => {
            throw new UserFixableError('missing credentials');
          },
        },
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(UserFixableError);
  });
});

import { describe, it, expect } from 'vitest';
import {
  TransientError,
  LLMRecoverableError,
  UserFixableError,
  UnexpectedError,
  classifyError,
} from './error-handler.js';

describe('error taxonomy (design §15)', () => {
  it('transient errors are retryable', () => {
    const e = new TransientError('rate limited');
    expect(e.errorClass).toBe('transient');
    expect(e.retryable).toBe(true);
  });

  it('LLM-recoverable errors are surfaced to the model, not retried by the harness', () => {
    const e = new LLMRecoverableError('bad tool args');
    expect(e.errorClass).toBe('llm_recoverable');
    expect(e.retryable).toBe(false);
  });

  it('user-fixable errors interrupt (not retryable)', () => {
    const e = new UserFixableError('missing credentials');
    expect(e.errorClass).toBe('user_fixable');
    expect(e.retryable).toBe(false);
  });

  it('unexpected errors bubble up (not retryable)', () => {
    const e = new UnexpectedError('schema corruption');
    expect(e.errorClass).toBe('unexpected');
    expect(e.retryable).toBe(false);
  });

  it('classifyError passes through harness errors unchanged', () => {
    const e = new TransientError('x');
    expect(classifyError(e)).toBe(e);
  });

  it('classifyError maps network/rate-limit signals to transient', () => {
    expect(classifyError(new Error('ECONNRESET')).errorClass).toBe('transient');
    expect(classifyError({ status: 503 }).errorClass).toBe('transient');
    expect(classifyError({ status: 429 }).errorClass).toBe('transient');
  });

  it('classifyError defaults unknown errors to unexpected', () => {
    expect(classifyError(new Error('boom')).errorClass).toBe('unexpected');
    expect(classifyError('weird').errorClass).toBe('unexpected');
  });
});

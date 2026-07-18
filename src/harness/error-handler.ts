// Error taxonomy (design §15). Four classes drive recovery in the ReAct loop.

export type ErrorClass = 'transient' | 'llm_recoverable' | 'user_fixable' | 'unexpected';

export abstract class HarnessError extends Error {
  abstract readonly errorClass: ErrorClass;
  abstract readonly retryable: boolean;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** Rate limit, network timeout, 503 — retry with backoff (max 2). */
export class TransientError extends HarnessError {
  readonly errorClass = 'transient' as const;
  readonly retryable = true;
}

/** Bad tool args / parse failure — return as a tool observation; the model retries. */
export class LLMRecoverableError extends HarnessError {
  readonly errorClass = 'llm_recoverable' as const;
  readonly retryable = false;
}

/** Missing credentials, approval rejected — interrupt and surface in the UI. */
export class UserFixableError extends HarnessError {
  readonly errorClass = 'user_fixable' as const;
  readonly retryable = false;
}

/** Uncaught exception / schema corruption — bubble up, mark job failed, keep trace. */
export class UnexpectedError extends HarnessError {
  readonly errorClass = 'unexpected' as const;
  readonly retryable = false;
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_CODE = /(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE)/i;

/** Best-effort mapping of an unknown thrown value into a HarnessError. */
export function classifyError(err: unknown): HarnessError {
  if (err instanceof HarnessError) return err;

  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: unknown }).status
      : undefined;
  if (typeof status === 'number' && TRANSIENT_STATUS.has(status)) {
    return new TransientError(`upstream status ${status}`, err);
  }

  const message = err instanceof Error ? err.message : String(err);
  if (TRANSIENT_CODE.test(message)) {
    return new TransientError(message, err);
  }
  return new UnexpectedError(message, err);
}

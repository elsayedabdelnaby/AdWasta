// Core harness types (design §8 handoff contract, §10 risk levels).

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type ArmId =
  | 'market'
  | 'trends'
  | 'competitors'
  | 'strategy'
  | 'content'
  | 'daily_strategist'
  | 'scheduler'
  | 'engagement'
  | 'publisher'
  | 'analyst';

export interface ArmError {
  code: string;
  message: string;
  retryable?: boolean;
}

/** Typed handoff between arms (design §8). Brain consumes summary + data only. */
export interface ArmResult<T = unknown> {
  arm: ArmId;
  tenantId: string;
  traceId: string;
  summary: string; // ≤ ~2k tokens for Brain consumption
  data: T;
  citations?: string[]; // required for intel arms
  confidence?: number;
  errors?: ArmError[];
}

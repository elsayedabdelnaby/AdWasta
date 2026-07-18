import { assessRisk } from './risk-assessor.js';

export type ApprovalStatus = 'approved' | 'pending' | 'rejected' | undefined;

export interface ExecuteDecision {
  allowed: boolean;
  risk: ReturnType<typeof assessRisk>;
  reason?: string;
}

/**
 * The harness gate before any adapter runs (design §10). HIGH-risk actions are
 * refused unless a human has approved. LOW/MEDIUM auto-execute. Never let the
 * model's own reasoning substitute for this check — permission is separate from
 * proposal (the model proposes, the harness permits).
 */
export function canExecute(
  _tenantId: string,
  action: string,
  approvalStatus: ApprovalStatus,
): ExecuteDecision {
  const risk = assessRisk(action);
  if (risk === 'HIGH' && approvalStatus !== 'approved') {
    return { allowed: false, risk, reason: `HIGH-risk action "${action}" requires human approval` };
  }
  return { allowed: true, risk };
}

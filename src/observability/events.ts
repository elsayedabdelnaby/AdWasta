import { randomUUID } from 'node:crypto';
import type { TenantDb } from '../db/client.js';
import { systemEvents } from '../db/schema/system-events.js';
import { auditLog } from '../db/schema/audit-log.js';

export type ActorType = 'user' | 'system' | 'crew' | 'adapter';
export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface EventInput {
  actorType: ActorType;
  actorId?: string;
  category: string; // tenant | toggle | credential | campaign | job | approval | ops | guardrail | budget | eval | ...
  action: string; // e.g. draft.approved, campaign.started
  resourceType?: string;
  resourceId?: string;
  jobId?: string;
  traceId?: string;
  campaignId?: string;
  severity?: Severity;
  message: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

// Keys whose values must never be persisted to the activity/audit stream (design §7.1).
// `token(?!s)` still redacts accessToken / authToken but not the plural
// count fields inputTokens / outputTokens (usage metrics, not secrets).
const SECRET_KEY = /(pass(word|phrase)?|secret|token(?!s)|api[_-]?key|apikey|authorization|cookie|credential|private[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|bearer)/i;
const REDACTED = '[REDACTED]';

/** Recursively redact secret-looking keys. Pure; safe on nested objects/arrays. */
export function sanitizeEventPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(payload) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : sanitizeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Write one system_events row inside the caller's tenant transaction (design §7.1:
 * events synchronous with the domain change). Returns the generated event_id.
 */
export async function emitEvent(
  tx: TenantDb,
  tenantId: string,
  input: EventInput,
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  await tx.insert(systemEvents).values({
    id: eventId,
    tenantId,
    actorType: input.actorType,
    actorId: input.actorId,
    category: input.category,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    jobId: input.jobId,
    traceId: input.traceId,
    campaignId: input.campaignId,
    severity: input.severity ?? 'info',
    message: input.message,
    payload: sanitizeEventPayload(input.payload ?? {}),
    ip: input.ip,
  });
  return { eventId };
}

/**
 * Compliance-grade write: the same event lands in both system_events and audit_log
 * under one shared event_id (design §7.1). Runs in the caller's transaction.
 */
export async function emitAudit(
  tx: TenantDb,
  tenantId: string,
  input: EventInput,
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  const payload = sanitizeEventPayload(input.payload ?? {});
  await tx.insert(systemEvents).values({
    id: eventId,
    tenantId,
    actorType: input.actorType,
    actorId: input.actorId,
    category: input.category,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    jobId: input.jobId,
    traceId: input.traceId,
    campaignId: input.campaignId,
    severity: input.severity ?? 'info',
    message: input.message,
    payload,
    ip: input.ip,
  });
  await tx.insert(auditLog).values({
    eventId,
    tenantId,
    actorType: input.actorType,
    actorId: input.actorId,
    category: input.category,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    message: input.message,
    payload,
    ip: input.ip,
  });
  return { eventId };
}

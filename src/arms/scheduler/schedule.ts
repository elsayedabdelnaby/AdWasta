import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { schedules } from '../../db/schema/schedules.js';
import { contentDrafts } from '../../db/schema/content-drafts.js';
import { platformConnections } from '../../db/schema/platform-connections.js';
import { emitEvent, emitAudit } from '../../observability/events.js';
import { canExecute } from '../../guardrails/permissions.js';
import { resolveAdapter } from '../../adapters/registry.js';

export type ScheduleType = 'social_post' | 'email_send';

export interface ScheduleInput {
  draftId?: string;
  type: ScheduleType;
  platform?: string;
  scheduledAt: Date;
  armed?: boolean;
  reminderLeadMs?: number;
}

const DEFAULT_LEAD_MS = 60 * 60 * 1000; // 1h before

export async function scheduleItem(db: Db, tenantId: string, input: ScheduleInput): Promise<string> {
  return db.withTenant(tenantId, async (tx) => {
    if (input.draftId) {
      const [draft] = await tx.select({ status: contentDrafts.status }).from(contentDrafts).where(eq(contentDrafts.id, input.draftId));
      if (!draft) throw Object.assign(new Error('draft not found'), { statusCode: 404 });
      if (draft.status !== 'approved') throw Object.assign(new Error('only approved drafts can be scheduled'), { statusCode: 409 });
    }
    const reminderAt = new Date(input.scheduledAt.getTime() - (input.reminderLeadMs ?? DEFAULT_LEAD_MS));
    const [row] = await tx
      .insert(schedules)
      .values({ tenantId, draftId: input.draftId, type: input.type, platform: input.platform, scheduledAt: input.scheduledAt, reminderAt, armed: input.armed ?? false })
      .returning({ id: schedules.id });
    await emitEvent(tx, tenantId, { actorType: 'crew', category: 'ops', action: 'schedule.created', resourceType: 'schedule', resourceId: row!.id, message: `scheduled ${input.type}` });
    return row!.id;
  });
}

/** T-minus reminder — moves pending → reminded and writes an audit entry. */
export async function fireReminder(db: Db, tenantId: string, scheduleId: string): Promise<boolean> {
  return db.withTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(schedules)
      .set({ status: 'reminded', lastStep: 'reminded', updatedAt: new Date() })
      .where(and(eq(schedules.id, scheduleId), eq(schedules.status, 'pending')))
      .returning({ id: schedules.id });
    if (rows.length === 0) return false;
    await emitAudit(tx, tenantId, { actorType: 'system', category: 'ops', action: 'schedule.reminded', resourceType: 'schedule', resourceId: scheduleId, message: 'reminder fired' });
    return true;
  });
}

export interface ExecuteResult {
  executed: boolean;
  blocked: boolean;
  reason: string;
}

/**
 * Armed execution (design §14, §10 permission model). NEVER executes without:
 * item armed + human-approved draft (HIGH-risk gate) + the API flag enabled +
 * valid mode. Copy-pack schedules are reminders only; live send is Phase-8 API.
 */
export async function executeSchedule(db: Db, tenantId: string, scheduleId: string): Promise<ExecuteResult> {
  const ctx = await db.withTenant(tenantId, async (tx) => {
    const [sched] = await tx.select().from(schedules).where(eq(schedules.id, scheduleId));
    if (!sched) return null;
    const draft = sched.draftId ? (await tx.select({ status: contentDrafts.status }).from(contentDrafts).where(eq(contentDrafts.id, sched.draftId)))[0] : undefined;
    const [conn] = sched.platform
      ? await tx.select().from(platformConnections).where(and(eq(platformConnections.tenantId, tenantId), eq(platformConnections.platform, sched.platform)))
      : [];
    return { sched, draftStatus: draft?.status, conn };
  });
  if (!ctx) return { executed: false, blocked: true, reason: 'schedule not found' };

  const { sched, draftStatus, conn } = ctx;

  if (!sched.armed) return block(db, tenantId, scheduleId, 'not armed');

  const action = sched.type === 'email_send' ? 'send_email' : 'publish';
  const decision = canExecute(tenantId, action, draftStatus === 'approved' ? 'approved' : 'pending');
  if (!decision.allowed) return block(db, tenantId, scheduleId, decision.reason ?? 'not permitted');

  const apiEnabled = sched.type === 'email_send' ? conn?.apiEmailEnabled : conn?.apiPublishEnabled;
  if (!apiEnabled) return block(db, tenantId, scheduleId, 'api execution not enabled for this platform');

  // Permission gate passed → attempt via the API adapter (scaffold until Phase 8).
  await setStatus(db, tenantId, scheduleId, 'executing', 'execute_start');
  try {
    const adapter = resolveAdapter(sched.platform ?? 'facebook', { publishMode: 'api', apiPublishEnabled: true, browserPublishEnabled: false });
    await adapter.publishPost!({ draftId: sched.draftId ?? '' });
    await setStatus(db, tenantId, scheduleId, 'published', 'execute_done');
    return { executed: true, blocked: false, reason: 'published' };
  } catch (err) {
    await setStatus(db, tenantId, scheduleId, 'failed', 'execute_failed');
    return { executed: false, blocked: false, reason: err instanceof Error ? err.message : 'execution failed' };
  }
}

async function block(db: Db, tenantId: string, scheduleId: string, reason: string): Promise<ExecuteResult> {
  await db.withTenant(tenantId, (tx) =>
    emitEvent(tx, tenantId, { actorType: 'system', category: 'guardrail', action: 'schedule.execution_blocked', severity: 'warning', resourceType: 'schedule', resourceId: scheduleId, message: reason }),
  );
  return { executed: false, blocked: true, reason };
}

async function setStatus(db: Db, tenantId: string, scheduleId: string, status: string, lastStep: string): Promise<void> {
  await db.withTenant(tenantId, (tx) => tx.update(schedules).set({ status, lastStep, updatedAt: new Date() }).where(eq(schedules.id, scheduleId)));
}

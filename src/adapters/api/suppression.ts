import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { emailSuppressions } from '../../db/schema/email-suppressions.js';
import { emitAudit } from '../../observability/events.js';

export type SuppressionReason = 'unsubscribe' | 'hard_bounce' | 'complaint';

const norm = (email: string): string => email.trim().toLowerCase();

export async function isSuppressed(db: Db, tenantId: string, email: string): Promise<boolean> {
  return db.withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: emailSuppressions.id })
      .from(emailSuppressions)
      .where(and(eq(emailSuppressions.tenantId, tenantId), eq(emailSuppressions.email, norm(email))));
    return rows.length > 0;
  });
}

/** Add an address to the suppression list (idempotent). Survives list re-import. */
export async function addSuppression(db: Db, tenantId: string, email: string, reason: SuppressionReason): Promise<void> {
  await db.withTenant(tenantId, async (tx) => {
    await tx
      .insert(emailSuppressions)
      .values({ tenantId, email: norm(email), reason })
      .onConflictDoNothing({ target: [emailSuppressions.tenantId, emailSuppressions.email] });
    await emitAudit(tx, tenantId, { actorType: 'system', category: 'ops', action: 'email.suppressed', resourceType: 'email_suppression', message: `suppressed (${reason})`, payload: { reason } });
  });
}

export interface ImportResult {
  imported: number;
  suppressed: number; // skipped because already suppressed
}

/**
 * Import a contact list — REFUSED without a consent attestation (design §21, no
 * purchased/scraped lists). Addresses already on the suppression list are never
 * re-added to the sendable set.
 */
export async function importContacts(
  db: Db,
  tenantId: string,
  args: { emails: string[]; consentConfirmed: boolean },
): Promise<ImportResult> {
  if (!args.consentConfirmed) {
    throw Object.assign(new Error('list import requires a consent_confirmed attestation'), { statusCode: 400 });
  }
  return db.withTenant(tenantId, async (tx) => {
    const suppressed = await tx.select({ email: emailSuppressions.email }).from(emailSuppressions).where(eq(emailSuppressions.tenantId, tenantId));
    const blocked = new Set(suppressed.map((s) => s.email));
    const sendable = args.emails.map(norm).filter((e) => !blocked.has(e));
    return { imported: sendable.length, suppressed: args.emails.length - sendable.length };
  });
}

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { ValidationResult, HealthResult } from '../types.js';
import { emailCredentialsSchema, type EmailCredentials } from '../../credentials/schemas/email.js';
import { publishedItems } from '../../db/schema/approval-queue.js';
import { emitAudit } from '../../observability/events.js';
import { isSuppressed } from './suppression.js';

export type EmailProvider = (msg: { to: string; from: string; subject: string; html: string }) => Promise<{ messageId: string }>;

export interface EmailAdapter {
  provider: 'email';
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  healthCheck(creds?: EmailCredentials): Promise<HealthResult>;
}

const SCAFFOLD = 'email API adapter is a scaffold — enable in settings with SMTP/SendGrid/Resend credentials (design §21)';

export function makeEmailAdapter(): EmailAdapter {
  return {
    provider: 'email',
    async validateCredentials(creds) {
      const parsed = emailCredentialsSchema.safeParse(creds);
      return parsed.success ? { valid: true } : { valid: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
    },
    async healthCheck(creds) {
      if (!creds) return { healthy: false, detail: SCAFFOLD };
      // SPF/DKIM/DMARC can't be verified from here — warn until the tenant confirms.
      return { healthy: true, detail: 'confirm SPF, DKIM, and DMARC are configured before first send (design §21)' };
    },
  };
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  draftId?: string;
  creds: EmailCredentials;
  unsubscribeUrl: string;
}

export interface SendEmailResult {
  sent: boolean;
  blocked: boolean;
  reason: string;
  publishedItemId?: string;
  messageId?: string;
}

/** CAN-SPAM footer + one-click unsubscribe, injected into every email (§21). */
export function buildEmailHtml(body: string, creds: EmailCredentials, unsubscribeUrl: string): string {
  const footer = `<hr><p style="font-size:12px;color:#888">${creds.fromName ?? creds.fromAddress} · ${creds.physicalAddress}<br>` +
    `<a href="${unsubscribeUrl}">Unsubscribe</a> · Reply-To: ${creds.replyTo ?? creds.fromAddress}</p>`;
  return `${body}${footer}`;
}

/**
 * Send an APPROVED email. Publisher gate (design §21, non-negotiable): REFUSES
 * suppressed recipients before anything is sent. Injects the unsubscribe link +
 * physical-address footer, then hands off to the provider. On success, creates the
 * published_items MEASURE anchor. HIGH-risk approval happens upstream.
 */
export async function sendEmail(
  deps: { db: Db; provider?: EmailProvider },
  tenantId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  // Harness gate: never send to a suppressed address.
  if (await isSuppressed(deps.db, tenantId, input.to)) {
    await deps.db.withTenant(tenantId, (tx) =>
      emitAudit(tx, tenantId, { actorType: 'system', category: 'guardrail', action: 'email.send_refused_suppressed', severity: 'warning', message: 'refused send to suppressed address' }),
    );
    return { sent: false, blocked: true, reason: 'recipient is on the suppression list' };
  }

  const html = buildEmailHtml(input.body, input.creds, input.unsubscribeUrl);

  if (!deps.provider) {
    return { sent: false, blocked: false, reason: SCAFFOLD };
  }

  const { messageId } = await deps.provider({ to: input.to, from: input.creds.fromAddress, subject: input.subject, html });

  const publishedItemId = await deps.db.withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .insert(publishedItems)
      .values({ tenantId, draftId: input.draftId ?? randomUUID(), platform: 'email', url: messageId, mode: 'api' })
      .returning({ id: publishedItems.id });
    await emitAudit(tx, tenantId, { actorType: 'system', category: 'ops', action: 'item.published', resourceType: 'published_item', resourceId: item!.id, message: 'email sent', payload: { platform: 'email', messageId } });
    return item!.id;
  });

  return { sent: true, blocked: false, reason: 'sent', publishedItemId, messageId };
}

export const emailWebhookEventSchema = z.object({
  messageId: z.string(),
  event: z.enum(['delivered', 'open', 'click', 'bounce', 'spamreport', 'unsubscribe']),
  email: z.string().email(),
});
export type EmailWebhookEvent = z.infer<typeof emailWebhookEventSchema>;

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Vault } from '../../credentials/vault.js';
import type { AuthHooks } from '../../auth/hook.js';
import { emailWebhookEventSchema } from '../../adapters/api/email.js';
import { verifyWebhookSignature, processEmailWebhook } from '../../adapters/api/webhook.js';
import { addSuppression } from '../../adapters/api/suppression.js';
import { isUuid } from '../../auth/hook.js';

// Webhooks + unsubscribe are MACHINE-facing: no session (design §7.2's "tenant from
// session" is for user routes). Tenant comes from the path; authenticity comes from
// the HMAC signature over the tenant's webhook secret (unauthenticated posters that
// don't know the secret are rejected). Handlers set app.tenant_id from the path.
export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { db: Db; vault: Vault; hooks: AuthHooks },
): void {
  const { db, vault } = deps;

  const WebhookBody = z.object({ events: z.array(emailWebhookEventSchema) });
  app.post('/webhooks/email/:tenantId', async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    if (!isUuid(tenantId)) return reply.code(400).send({ error: 'invalid tenant id' });

    const creds = await vault.getCredentials<{ webhookSecret?: string }>(tenantId, 'email').catch(() => null);
    if (!creds?.webhookSecret) return reply.code(401).send({ error: 'webhook not configured' });

    const signature = req.headers['x-webhook-signature'];
    const rawBody = JSON.stringify(req.body);
    if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, creds.webhookSecret, signature)) {
      return reply.code(401).send({ error: 'invalid signature' });
    }

    const body = WebhookBody.parse(req.body);
    const result = await processEmailWebhook(db, tenantId, body.events);
    return { ok: true, ...result };
  });

  // One-click unsubscribe (design §21). Public + idempotent. A production link
  // carries a signed token; the suppression list + send gate are the guarantee.
  const UnsubBody = z.object({ email: z.string().email() });
  app.post('/unsubscribe/:tenantId', async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    if (!isUuid(tenantId)) return reply.code(400).send({ error: 'invalid tenant id' });
    const { email } = UnsubBody.parse(req.body);
    await addSuppression(db, tenantId, email, 'unsubscribe');
    return { unsubscribed: true };
  });
}

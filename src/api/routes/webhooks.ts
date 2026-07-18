import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Vault } from '../../credentials/vault.js';
import type { AuthHooks } from '../../auth/hook.js';
import { emailWebhookEventSchema } from '../../adapters/api/email.js';
import { verifyWebhookSignature, processEmailWebhook } from '../../adapters/api/webhook.js';
import { verifyUnsubscribe } from '../../adapters/api/unsubscribe.js';
import { addSuppression } from '../../adapters/api/suppression.js';
import { isUuid } from '../../auth/hook.js';

// Webhooks + unsubscribe are MACHINE-facing: no session (§7.2's "tenant from
// session" is for user routes). Tenant comes from the path; authenticity comes from
// a cryptographic signature (HMAC over the tenant's webhook secret; a signed token
// for unsubscribe). Callers without the secret/token are rejected.
export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { db: Db; vault: Vault; hooks: AuthHooks; unsubscribeSecret: Buffer },
): void {
  const { db, vault, unsubscribeSecret } = deps;
  const WebhookBody = z.object({ events: z.array(emailWebhookEventSchema) });

  // Encapsulated scope with a RAW-body JSON parser, so the signature is verified
  // against the exact received bytes (providers sign the raw payload, not a
  // re-serialization). Scoped so it doesn't change parsing for other routes.
  app.register(async (scoped) => {
    scoped.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      const raw = typeof body === 'string' ? body : '';
      (_req as unknown as { rawBody: string }).rawBody = raw;
      try {
        done(null, raw === '' ? {} : JSON.parse(raw));
      } catch (err) {
        done(err as Error);
      }
    });

    scoped.post('/webhooks/email/:tenantId', async (req: FastifyRequest, reply) => {
      const { tenantId } = req.params as { tenantId: string };
      if (!isUuid(tenantId)) return reply.code(400).send({ error: 'invalid tenant id' });

      const creds = await vault.getCredentials<{ webhookSecret?: string }>(tenantId, 'email').catch(() => null);
      if (!creds?.webhookSecret) return reply.code(401).send({ error: 'webhook not configured' });

      const signature = req.headers['x-webhook-signature'];
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';
      if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, creds.webhookSecret, signature)) {
        return reply.code(401).send({ error: 'invalid signature' });
      }

      const body = WebhookBody.parse(req.body);
      const result = await processEmailWebhook(db, tenantId, body.events);
      return { ok: true, ...result };
    });
  });

  // One-click unsubscribe: a SIGNED link only we can mint (design §21). Without a
  // valid token, arbitrary addresses can't be added to the suppression list.
  const UnsubQuery = z.object({ email: z.string().email(), sig: z.string().min(1) });
  app.get('/unsubscribe/:tenantId', async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    if (!isUuid(tenantId)) return reply.code(400).send({ error: 'invalid tenant id' });
    const { email, sig } = UnsubQuery.parse(req.query);
    if (!verifyUnsubscribe(tenantId, email, sig, unsubscribeSecret)) {
      return reply.code(401).send({ error: 'invalid unsubscribe token' });
    }
    await addSuppression(db, tenantId, email, 'unsubscribe');
    return { unsubscribed: true };
  });
}

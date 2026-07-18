import { createHmac, timingSafeEqual } from 'node:crypto';

// One-click unsubscribe links are HMAC-signed so a link can only be minted by us
// (design §21). Prevents arbitrary suppression of other people's addresses.
/** A purpose-separated signing key derived from the master KEK (not the KEK itself). */
export function deriveUnsubscribeSecret(kekBase64: string): Buffer {
  return createHmac('sha256', Buffer.from(kekBase64, 'base64')).update('unsubscribe-link-signing-v1').digest();
}

const canonical = (tenantId: string, email: string): string => `${tenantId}:${email.trim().toLowerCase()}`;

export function signUnsubscribe(tenantId: string, email: string, secret: string | Buffer): string {
  return createHmac('sha256', secret).update(canonical(tenantId, email)).digest('hex');
}

export function verifyUnsubscribe(tenantId: string, email: string, sig: string, secret: string | Buffer): boolean {
  const expected = signUnsubscribe(tenantId, email, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build a signed one-click unsubscribe URL for an email footer. */
export function unsubscribeUrl(baseUrl: string, tenantId: string, email: string, secret: string | Buffer): string {
  const sig = signUnsubscribe(tenantId, email, secret);
  return `${baseUrl.replace(/\/$/, '')}/unsubscribe/${tenantId}?email=${encodeURIComponent(email)}&sig=${sig}`;
}

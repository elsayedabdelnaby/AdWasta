import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

/** 32 random bytes — a KEK or a DEK. */
export function generateKey(): Buffer {
  return randomBytes(KEY_LEN);
}

/**
 * Encrypt `plaintext` under `key` (AES-256-GCM). Output is base64 of
 * iv(12) || authTag(16) || ciphertext — self-describing, no side channel needed.
 */
export function seal(key: Buffer, plaintext: Buffer): string {
  if (key.length !== KEY_LEN) throw new Error(`key must be ${KEY_LEN} bytes`);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Decrypt a value produced by {@link seal}. Throws on wrong key or tampering. */
export function open(key: Buffer, packed: string): Buffer {
  if (key.length !== KEY_LEN) throw new Error(`key must be ${KEY_LEN} bytes`);
  const buf = Buffer.from(packed, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

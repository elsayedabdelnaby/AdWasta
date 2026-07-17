import { describe, it, expect } from 'vitest';
import { generateKey, seal, open } from './crypto.js';

describe('envelope crypto primitives (AES-256-GCM, design §11)', () => {
  it('round-trips plaintext under the same key', () => {
    const key = generateKey();
    const pt = Buffer.from('super-secret-token');
    expect(open(key, seal(key, pt)).toString()).toBe('super-secret-token');
  });

  it('generates 32-byte keys', () => {
    expect(generateKey()).toHaveLength(32);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const key = generateKey();
    const pt = Buffer.from('x');
    expect(seal(key, pt)).not.toBe(seal(key, pt));
  });

  it('fails to open with the wrong key (GCM auth tag)', () => {
    const packed = seal(generateKey(), Buffer.from('secret'));
    expect(() => open(generateKey(), packed)).toThrow();
  });

  it('fails to open tampered ciphertext', () => {
    const key = generateKey();
    const packed = seal(key, Buffer.from('secret'));
    const bytes = Buffer.from(packed, 'base64');
    bytes[bytes.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => open(key, bytes.toString('base64'))).toThrow();
  });
});

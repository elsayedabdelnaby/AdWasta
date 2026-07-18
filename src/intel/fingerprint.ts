import { createHash } from 'node:crypto';

// 64-bit SimHash content fingerprint (ADR-003). Small content edits produce a
// small Hamming distance; unrelated content is far. Used by the Tier-0 watch to
// decide "materially changed?" without an LLM.

const MASK64 = (1n << 64n) - 1n;

function hash64(token: string): bigint {
  const digest = createHash('sha1').update(token).digest();
  let h = 0n;
  for (let i = 0; i < 8; i++) h = (h << 8n) | BigInt(digest[i]!);
  return h & MASK64;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Compute a 64-bit SimHash, returned as 16 lowercase hex chars. */
export function simhash(text: string): string {
  const weights = new Array<number>(64).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = hash64(token);
    for (let b = 0; b < 64; b++) {
      const bit = (h >> BigInt(b)) & 1n;
      weights[b]! += bit === 1n ? 1 : -1;
    }
  }
  let fp = 0n;
  for (let b = 0; b < 64; b++) {
    if (weights[b]! > 0) fp |= 1n << BigInt(b);
  }
  return fp.toString(16).padStart(16, '0');
}

/** Number of differing bits between two 16-hex fingerprints (0..64). */
export function hammingDistance(a: string, b: string): number {
  let x = (BigInt(`0x${a}`) ^ BigInt(`0x${b}`)) & MASK64;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** True when two fingerprints are within the near-duplicate band (default ≤3/64). */
export function isNearDuplicate(a: string, b: string, threshold = 3): boolean {
  return hammingDistance(a, b) <= threshold;
}

export const NEAR_DUPLICATE_THRESHOLD = 3;

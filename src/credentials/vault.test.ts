import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { EnvKeyProvider } from './key-provider.js';
import { Vault } from './vault.js';
import { generateKey, open } from './crypto.js';

const kek1 = loadConfig().CREDENTIALS_MASTER_KEY; // base64 32 bytes (test env)
let db: Db;
const A = randomUUID(); // round-trip + cross-tenant misuse (stays on kek1)
const B = randomUUID(); // KEK rotation
const C = randomUUID(); // per-tenant DEK rotation (stays on kek1)
const ids = [A, B, C];

beforeAll(async () => {
  db = createDb(loadConfig());
  for (const id of ids) {
    await db.withTenant(id, async (tx) => {
      await tx.insert(tenants).values({ id, name: `Vault ${id.slice(0, 8)}` });
    });
  }
});

afterAll(async () => {
  for (const id of ids) {
    await db.adminPool.query('DELETE FROM credentials WHERE tenant_id = $1', [id]);
    await db.adminPool.query('DELETE FROM tenant_deks WHERE tenant_id = $1', [id]);
    await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [id]);
  }
  await db.close();
});

async function ciphertextOf(tenantId: string, platform: string): Promise<string> {
  const r = await db.adminPool.query(
    'SELECT ciphertext FROM credentials WHERE tenant_id = $1 AND platform = $2',
    [tenantId, platform],
  );
  return r.rows[0].ciphertext as string;
}

describe('Vault — envelope encryption (design §11)', () => {
  it('round-trips credentials for a tenant', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    await vault.saveCredentials(A, 'facebook', { accessToken: 'fb-A-secret', pageId: '123' });
    expect(await vault.getCredentials(A, 'facebook')).toEqual({
      accessToken: 'fb-A-secret',
      pageId: '123',
    });
  });

  it('returns null when no credentials exist', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    expect(await vault.getCredentials(A, 'twitter')).toBeNull();
  });

  it('never stores plaintext in the ciphertext column', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    await vault.saveCredentials(A, 'instagram', { accessToken: 'PLAINTEXT-MARKER-XYZ' });
    expect(await ciphertextOf(A, 'instagram')).not.toContain('PLAINTEXT-MARKER-XYZ');
  });

  it('overwrites credentials for the same (tenant, platform)', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    await vault.saveCredentials(A, 'linkedin', { accessToken: 'v1' });
    await vault.saveCredentials(A, 'linkedin', { accessToken: 'v2' });
    expect(await vault.getCredentials(A, 'linkedin')).toEqual({ accessToken: 'v2' });
  });

  it('per-tenant DEK rotation re-encrypts that tenant’s rows; secret still readable', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    await vault.saveCredentials(C, 'facebook', { accessToken: 'fb-C-secret' });
    const before = await ciphertextOf(C, 'facebook');

    await vault.rotateTenantDek(C);

    expect(await ciphertextOf(C, 'facebook')).not.toBe(before);
    expect(await vault.getCredentials(C, 'facebook')).toEqual({ accessToken: 'fb-C-secret' });
  });

  it('cross-tenant DEK misuse fails: A’s DEK cannot open C’s ciphertext', async () => {
    const kekA = Buffer.from(kek1, 'base64'); // both A and C are under kek1, distinct DEKs
    const aDek = await db.adminPool.query('SELECT wrapped_dek FROM tenant_deks WHERE tenant_id = $1', [A]);
    const dekA = open(kekA, aDek.rows[0].wrapped_dek);
    const cCipher = await ciphertextOf(C, 'facebook');
    expect(() => open(dekA, cCipher)).toThrow();
  });

  // LAST: rotateKek is global — it re-wraps every tenant DEK (A and C included),
  // so it must run after the tests above that rely on the original KEK.
  it('KEK rotation re-wraps DEKs: new-KEK vault decrypts, old-KEK vault cannot', async () => {
    const vault = new Vault(db, new EnvKeyProvider(kek1));
    await vault.saveCredentials(B, 'facebook', { accessToken: 'fb-B-secret' });

    const kek2 = generateKey().toString('base64');
    const rewrapped = await vault.rotateKek(Buffer.from(kek2, 'base64'));
    expect(rewrapped).toBeGreaterThanOrEqual(1);

    const newVault = new Vault(db, new EnvKeyProvider(kek2));
    expect(await newVault.getCredentials(B, 'facebook')).toEqual({ accessToken: 'fb-B-secret' });

    const oldVault = new Vault(db, new EnvKeyProvider(kek1));
    await expect(oldVault.getCredentials(B, 'facebook')).rejects.toThrow();
  });
});

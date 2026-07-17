import { eq, and } from 'drizzle-orm';
import type { Db, TenantDb } from '../db/client.js';
import { credentials, tenantDeks } from '../db/schema/credentials.js';
import type { KeyProvider } from './key-provider.js';
import { generateKey, seal, open } from './crypto.js';

/**
 * Envelope-encryption credential vault (design §11). One DEK per tenant, wrapped
 * with the master KEK; secrets are AES-256-GCM under the tenant DEK. Plaintext
 * never leaves this module and is never persisted.
 */
export class Vault {
  constructor(
    private readonly db: Db,
    private readonly keys: KeyProvider,
  ) {}

  /** Load the tenant's DEK, generating + wrapping one on first use. */
  private async getOrCreateDek(tx: TenantDb, tenantId: string, kek: Buffer): Promise<Buffer> {
    const rows = await tx
      .select({ wrappedDek: tenantDeks.wrappedDek })
      .from(tenantDeks)
      .where(eq(tenantDeks.tenantId, tenantId));
    if (rows[0]) return open(kek, rows[0].wrappedDek);

    const dek = generateKey();
    await tx.insert(tenantDeks).values({ tenantId, wrappedDek: seal(kek, dek) });
    return dek;
  }

  async saveCredentials(
    tenantId: string,
    platform: string,
    payload: Record<string, unknown>,
    credentialType = 'api_key',
  ): Promise<void> {
    const kek = await this.keys.getKek();
    await this.db.withTenant(tenantId, async (tx) => {
      const dek = await this.getOrCreateDek(tx, tenantId, kek);
      const ciphertext = seal(dek, Buffer.from(JSON.stringify(payload), 'utf8'));
      await tx
        .insert(credentials)
        .values({ tenantId, platform, credentialType, ciphertext })
        .onConflictDoUpdate({
          target: [credentials.tenantId, credentials.platform, credentials.credentialType],
          set: { ciphertext, updatedAt: new Date() },
        });
    });
  }

  async getCredentials<T = Record<string, unknown>>(
    tenantId: string,
    platform: string,
    credentialType = 'api_key',
  ): Promise<T | null> {
    const kek = await this.keys.getKek();
    return this.db.withTenant(tenantId, async (tx) => {
      const dekRows = await tx
        .select({ wrappedDek: tenantDeks.wrappedDek })
        .from(tenantDeks)
        .where(eq(tenantDeks.tenantId, tenantId));
      if (!dekRows[0]) return null;

      const credRows = await tx
        .select({ ciphertext: credentials.ciphertext })
        .from(credentials)
        .where(
          and(
            eq(credentials.tenantId, tenantId),
            eq(credentials.platform, platform),
            eq(credentials.credentialType, credentialType),
          ),
        );
      if (!credRows[0]) return null;

      const dek = open(kek, dekRows[0].wrappedDek);
      const plaintext = open(dek, credRows[0].ciphertext);
      return JSON.parse(plaintext.toString('utf8')) as T;
    });
  }

  /**
   * Rotate the master KEK: re-wrap every tenant DEK from the current KEK to
   * `newKek`. Credential ciphertext is untouched (design §11 — DEKs only).
   * Cross-tenant admin operation; returns the number of DEKs re-wrapped. After
   * this, the process must run with `newKek` as its KEK.
   */
  async rotateKek(newKek: Buffer): Promise<number> {
    if (newKek.length !== 32) throw new Error('new KEK must be 32 bytes');
    const oldKek = await this.keys.getKek();
    // Atomic: a failure to unwrap any DEK (corrupt row / mixed KEK state) rolls
    // back the whole rotation, so the fleet never ends up split across two KEKs.
    const client = await this.db.adminPool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query('SELECT tenant_id, wrapped_dek FROM tenant_deks FOR UPDATE');
      for (const row of rows.rows as { tenant_id: string; wrapped_dek: string }[]) {
        const dek = open(oldKek, row.wrapped_dek);
        await client.query('UPDATE tenant_deks SET wrapped_dek = $1, updated_at = now() WHERE tenant_id = $2', [
          seal(newKek, dek),
          row.tenant_id,
        ]);
      }
      await client.query('COMMIT');
      return rows.rowCount ?? 0;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Rotate one tenant's DEK: generate a fresh DEK, re-encrypt all of that
   * tenant's credential rows under it, and re-wrap the new DEK with the KEK.
   */
  async rotateTenantDek(tenantId: string): Promise<void> {
    const kek = await this.keys.getKek();
    await this.db.withTenant(tenantId, async (tx) => {
      const dekRows = await tx
        .select({ wrappedDek: tenantDeks.wrappedDek })
        .from(tenantDeks)
        .where(eq(tenantDeks.tenantId, tenantId));
      if (!dekRows[0]) return; // nothing encrypted yet
      const oldDek = open(kek, dekRows[0].wrappedDek);
      const newDek = generateKey();

      const creds = await tx
        .select({ id: credentials.id, ciphertext: credentials.ciphertext })
        .from(credentials)
        .where(eq(credentials.tenantId, tenantId));
      for (const c of creds) {
        const plaintext = open(oldDek, c.ciphertext);
        await tx
          .update(credentials)
          .set({ ciphertext: seal(newDek, plaintext), updatedAt: new Date() })
          .where(eq(credentials.id, c.id));
      }
      await tx
        .update(tenantDeks)
        .set({ wrappedDek: seal(kek, newDek), updatedAt: new Date() })
        .where(eq(tenantDeks.tenantId, tenantId));
    });
  }
}

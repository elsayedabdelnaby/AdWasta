import pg from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AppConfig } from '../config/env.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

export type Schema = typeof schema;
export type TenantDb = NodePgDatabase<Schema>;
export type TenantTx = (db: TenantDb, client: PoolClient) => Promise<unknown>;

export interface Db {
  /** App connection pool — non-superuser role, RLS enforced. */
  appPool: PgPool;
  /** Owner/superuser pool — migrations + narrow privileged lookups only. */
  adminPool: PgPool;
  /**
   * Run `fn` inside a transaction with `app.tenant_id` set to `tenantId`
   * (transaction-local). Every query inside is governed by RLS + the explicit
   * tenant scoping the callers add. Rolls back on throw.
   */
  withTenant<T>(
    tenantId: string,
    fn: (db: TenantDb, client: PoolClient) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

export function createDb(config: AppConfig): Db {
  const appPool = new Pool({ connectionString: config.DATABASE_URL });
  const adminPool = new Pool({
    connectionString: config.DATABASE_ADMIN_URL ?? config.DATABASE_URL,
  });

  async function withTenant<T>(
    tenantId: string,
    fn: (db: TenantDb, client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      // transaction-local: resets automatically at COMMIT/ROLLBACK, safe under pooling
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const db = drizzle(client, { schema });
      const result = await fn(db, client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function close(): Promise<void> {
    await Promise.all([appPool.end(), adminPool.end()]);
  }

  return { appPool, adminPool, withTenant, close };
}

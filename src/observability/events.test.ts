import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { systemEvents } from '../db/schema/system-events.js';
import { auditLog } from '../db/schema/audit-log.js';
import { sanitizeEventPayload, emitEvent, emitAudit } from './events.js';

describe('sanitizeEventPayload (pure — never log secrets, design §7.1)', () => {
  it('redacts secret-looking keys, recursively', () => {
    const out = sanitizeEventPayload({
      platform: 'facebook',
      api_key: 'sk-live-123',
      nested: { accessToken: 'abc', ok: 1 },
      list: [{ client_secret: 'zzz' }, 'plain'],
    });
    expect(out.platform).toBe('facebook');
    expect(out.api_key).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).accessToken).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(((out.list as unknown[])[0] as Record<string, unknown>).client_secret).toBe('[REDACTED]');
    expect((out.list as unknown[])[1]).toBe('plain');
  });

  it('leaves non-secret payloads untouched', () => {
    const out = sanitizeEventPayload({ count: 3, name: 'aurora' });
    expect(out).toEqual({ count: 3, name: 'aurora' });
  });

  it('keeps token-count metrics but still redacts token secrets', () => {
    const out = sanitizeEventPayload({ inputTokens: 5000, outputTokens: 1200, accessToken: 'sk-x' });
    expect(out.inputTokens).toBe(5000);
    expect(out.outputTokens).toBe(1200);
    expect(out.accessToken).toBe('[REDACTED]');
  });
});

describe('emitEvent / emitAudit (DB-backed, tenant-scoped)', () => {
  const T = randomUUID();
  let db: Db;

  beforeAll(async () => {
    db = createDb(loadConfig());
    await db.withTenant(T, async (tx) => {
      await tx.insert(tenants).values({ id: T, name: 'Events Tenant' });
    });
  });

  afterAll(async () => {
    await db.adminPool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
    await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T]);
    await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
    await db.close();
  });

  it('emitEvent writes one system_events row queryable by tenant', async () => {
    const { eventId } = await db.withTenant(T, (tx) =>
      emitEvent(tx, T, {
        actorType: 'system',
        category: 'tenant',
        action: 'tenant.created',
        message: 'created',
      }),
    );
    const rows = await db.withTenant(T, (tx) =>
      tx.select().from(systemEvents).where(eq(systemEvents.id, eventId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('tenant.created');
  });

  it('emitAudit doubles into system_events AND audit_log under one shared event_id', async () => {
    const { eventId } = await db.withTenant(T, (tx) =>
      emitAudit(tx, T, {
        actorType: 'user',
        actorId: 'user_1',
        category: 'credential',
        action: 'credential.saved',
        message: 'saved fb creds',
        payload: { platform: 'facebook', api_key: 'sk-should-be-stripped' },
      }),
    );

    const evt = await db.withTenant(T, (tx) =>
      tx.select().from(systemEvents).where(eq(systemEvents.id, eventId)),
    );
    const aud = await db.withTenant(T, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.eventId, eventId)),
    );

    expect(evt).toHaveLength(1);
    expect(aud).toHaveLength(1);
    // secret stripped in BOTH stored payloads
    expect((evt[0]!.payload as Record<string, unknown>).api_key).toBe('[REDACTED]');
    expect((aud[0]!.payload as Record<string, unknown>).api_key).toBe('[REDACTED]');
    expect((aud[0]!.payload as Record<string, unknown>).platform).toBe('facebook');
  });

  it('app_user cannot UPDATE or DELETE audit_log (append-only, design §7.1)', async () => {
    const { eventId } = await db.withTenant(T, (tx) =>
      emitAudit(tx, T, {
        actorType: 'system',
        category: 'toggle',
        action: 'toggle.changed',
        message: 'immutable check',
      }),
    );
    await expect(
      db.withTenant(T, (tx) =>
        tx.update(auditLog).set({ message: 'tampered' }).where(eq(auditLog.eventId, eventId)),
      ),
    ).rejects.toThrow();
    await expect(
      db.withTenant(T, (tx) => tx.delete(auditLog).where(eq(auditLog.eventId, eventId))),
    ).rejects.toThrow();
  });
});

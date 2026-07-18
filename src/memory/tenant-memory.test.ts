import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/env.js';
import { createDb, type Db } from '../db/client.js';
import { tenants, tenantProfiles } from '../db/schema/tenants.js';
import { jobs } from '../db/schema/jobs.js';
import { emitAudit } from '../observability/events.js';
import {
  appendShortTerm,
  readShortTerm,
  mergeWorkingMemory,
  readWorkingMemory,
  readLongTerm,
  readEpisodic,
} from './tenant-memory.js';

let db: Db;
const T = randomUUID();
let jobId: string;

beforeAll(async () => {
  db = createDb(loadConfig());
  jobId = await db.withTenant(T, async (tx) => {
    await tx.insert(tenants).values({ id: T, name: 'Mem Tenant' });
    await tx.insert(tenantProfiles).values({ tenantId: T, description: 'coffee roaster', voice: 'warm' });
    const [j] = await tx.insert(jobs).values({ tenantId: T, arm: 'market' }).returning({ id: jobs.id });
    return j!.id;
  });
});

afterAll(async () => {
  await db.adminPool.query('DELETE FROM audit_log WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM system_events WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM jobs WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenant_profiles WHERE tenant_id = $1', [T]);
  await db.adminPool.query('DELETE FROM tenants WHERE id = $1', [T]);
  await db.close();
});

describe('tenant-memory (design §5)', () => {
  it('appends to and reads back the short-term buffer on the job record', async () => {
    await appendShortTerm(db, T, jobId, { role: 'user', content: 'find coffee trends' });
    await appendShortTerm(db, T, jobId, { role: 'assistant', content: 'searching' });
    const buffer = await readShortTerm(db, T, jobId);
    expect(buffer).toHaveLength(2);
    expect(buffer[0]!.content).toBe('find coffee trends');
  });

  it('merges and reads working memory JSON on the job record', async () => {
    await mergeWorkingMemory(db, T, jobId, { stage: 'research' });
    await mergeWorkingMemory(db, T, jobId, { candidates: 3 });
    expect(await readWorkingMemory(db, T, jobId)).toEqual({ stage: 'research', candidates: 3 });
  });

  it('reads long-term memory from the tenant profile', async () => {
    const lt = await readLongTerm(db, T);
    expect(lt.profile?.description).toBe('coffee roaster');
    expect(lt.profile?.voice).toBe('warm');
  });

  it('reads episodic memory from the audit log', async () => {
    await db.withTenant(T, (tx) =>
      emitAudit(tx, T, {
        actorType: 'user',
        category: 'approval',
        action: 'draft.approved',
        message: 'approved a draft',
      }),
    );
    const ep = await readEpisodic(db, T, { limit: 10 });
    expect(ep.audit.map((a) => a.action)).toContain('draft.approved');
  });
});

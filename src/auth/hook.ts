import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { memberships } from '../db/schema/memberships.js';
import type { Session, SessionProvider } from './session-provider.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: Session;
    tenantId?: string;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// Tables whose rows can be authorized by resolving their tenant_id (bare
// /jobs/:id, /traces/:id). Whitelisted to keep the identifier out of dynamic SQL.
const RESOURCE_TABLES = { jobs: 'jobs', traces: 'agent_traces' } as const;
export type ResourceKind = keyof typeof RESOURCE_TABLES;

export interface AuthHooks {
  /** 401 if there is no valid session. Sets req.session. */
  requireAuth: preHandlerHookHandler;
  /** Requires req.session to be a member of :id. 401 anon, 403 non-member. Sets req.tenantId. */
  requireTenantMember: preHandlerHookHandler;
  /**
   * Authorize a bare resource route (/jobs/:id): resolve the row's tenant via a
   * narrow owner lookup, verify membership, set req.tenantId. Returns the tenant
   * id, or undefined after already replying (401/403/404).
   */
  authorizeResource(
    req: FastifyRequest,
    reply: FastifyReply,
    kind: ResourceKind,
    resourceId: string,
  ): Promise<string | undefined>;
}

async function isMember(db: Db, tenantId: string, userId: string): Promise<boolean> {
  return db.withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));
    return rows.length > 0;
  });
}

export function makeAuthHooks(db: Db, provider: SessionProvider): AuthHooks {
  const requireAuth: preHandlerHookHandler = async (req, reply) => {
    const session = await provider.resolveSession(req);
    if (!session) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    req.session = session;
  };

  const requireTenantMember: preHandlerHookHandler = async (req, reply) => {
    const session = req.session ?? (await provider.resolveSession(req));
    if (!session) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    req.session = session;
    const tenantId = (req.params as { id?: string }).id;
    if (!isUuid(tenantId)) {
      return reply.code(400).send({ error: 'invalid tenant id' });
    }
    if (!(await isMember(db, tenantId, session.userId))) {
      // ADR-002: the :id path param is never trusted — membership must be proven.
      return reply.code(403).send({ error: 'forbidden' });
    }
    req.tenantId = tenantId;
  };

  const authorizeResource = async (
    req: FastifyRequest,
    reply: FastifyReply,
    kind: ResourceKind,
    resourceId: string,
  ): Promise<string | undefined> => {
    const session = req.session ?? (await provider.resolveSession(req));
    if (!session) {
      reply.code(401).send({ error: 'unauthenticated' });
      return undefined;
    }
    req.session = session;
    if (!isUuid(resourceId)) {
      reply.code(400).send({ error: 'invalid id' });
      return undefined;
    }
    const table = RESOURCE_TABLES[kind];
    const r = await db.adminPool.query(`SELECT tenant_id FROM ${table} WHERE id = $1`, [resourceId]);
    const tenantId: string | undefined = r.rows[0]?.tenant_id;
    if (!tenantId) {
      reply.code(404).send({ error: 'not found' });
      return undefined;
    }
    if (!(await isMember(db, tenantId, session.userId))) {
      reply.code(404).send({ error: 'not found' }); // don't leak existence to non-members
      return undefined;
    }
    req.tenantId = tenantId;
    return tenantId;
  };

  return { requireAuth, requireTenantMember, authorizeResource };
}

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { memberships } from '../../db/schema/memberships.js';
import { emitEvent, emitAudit } from '../../observability/events.js';

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(200).optional(),
  locale: z.string().max(20).optional(),
  timezone: z.string().max(60).optional(),
});

const OnboardSchema = z.object({
  description: z.string().max(4000).optional(),
  audience: z.string().max(4000).optional(),
  goals: z.array(z.string()).optional(),
  voice: z.string().max(4000).optional(),
  competitors: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
});

export function registerTenantRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  // Create a workspace. The caller becomes its owner (membership) — this is the
  // one tenant route with no :id, so it authenticates but cannot check membership.
  app.post('/tenants', { preHandler: hooks.requireAuth }, async (req, reply) => {
    const body = CreateTenantSchema.parse(req.body);
    const userId = req.session!.userId;
    const tenantId = randomUUID();
    await db.withTenant(tenantId, async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        name: body.name,
        industry: body.industry,
        ...(body.locale ? { locale: body.locale } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {}),
      });
      await tx.insert(memberships).values({ tenantId, userId, role: 'owner' });
      await emitAudit(tx, tenantId, {
        actorType: 'user',
        actorId: userId,
        category: 'tenant',
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenantId,
        message: `tenant "${body.name}" created`,
        payload: { name: body.name },
      });
    });
    return reply.code(201).send({ id: tenantId });
  });

  // Read a tenant — members only (app.tenant_id set by requireTenantMember).
  app.get('/tenants/:id', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const tenantId = req.tenantId!;
    const row = await db.withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
      return rows[0];
    });
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  // Onboard / update the business profile (Zod-validated) — members only.
  app.post('/tenants/:id/onboard', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const profile = OnboardSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const userId = req.session!.userId;
    await db.withTenant(tenantId, async (tx) => {
      await tx
        .insert(tenantProfiles)
        .values({
          tenantId,
          description: profile.description,
          audience: profile.audience,
          voice: profile.voice,
          ...(profile.goals ? { goals: profile.goals } : {}),
          ...(profile.competitors ? { competitors: profile.competitors } : {}),
          ...(profile.platforms ? { platforms: profile.platforms } : {}),
        })
        .onConflictDoUpdate({
          target: tenantProfiles.tenantId,
          set: {
            description: profile.description,
            audience: profile.audience,
            voice: profile.voice,
            ...(profile.goals ? { goals: profile.goals } : {}),
            ...(profile.competitors ? { competitors: profile.competitors } : {}),
            ...(profile.platforms ? { platforms: profile.platforms } : {}),
            updatedAt: new Date(),
          },
        });
      await emitEvent(tx, tenantId, {
        actorType: 'user',
        actorId: userId,
        category: 'tenant',
        action: 'tenant.onboarded',
        resourceType: 'tenant_profile',
        resourceId: tenantId,
        message: 'business profile saved',
      });
    });
    return reply.send({ tenantId });
  });
}

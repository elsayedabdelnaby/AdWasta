import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { tenants, tenantProfiles } from '../../db/schema/tenants.js';
import { memberships } from '../../db/schema/memberships.js';
import { competitors } from '../../db/schema/competitors.js';
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
  website: z.string().url().max(2000).optional(),
  // Public page urls keyed by platform, e.g. { facebook: "https://facebook.com/acme" }.
  socialUrls: z.record(z.string().url().max(2000)).optional(),
});

const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function registerTenantRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  // Raw-buffer parser for logo uploads (fastify only parses JSON by default).
  app.addContentTypeParser(LOGO_MIME_TYPES, { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

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

  // Read the business profile (form prefill) — members only. Logo bytes are
  // deliberately excluded; the logo has its own binary endpoint below.
  app.get('/tenants/:id/profile', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const tenantId = req.tenantId!;
    const row = await db.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          description: tenantProfiles.description,
          audience: tenantProfiles.audience,
          voice: tenantProfiles.voice,
          goals: tenantProfiles.goals,
          competitors: tenantProfiles.competitors,
          platforms: tenantProfiles.platforms,
          website: tenantProfiles.website,
          socialUrls: tenantProfiles.socialUrls,
        })
        .from(tenantProfiles)
        .where(eq(tenantProfiles.tenantId, tenantId));
      return rows[0];
    });
    return reply.send(row ?? {});
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
          website: profile.website,
          ...(profile.goals ? { goals: profile.goals } : {}),
          ...(profile.competitors ? { competitors: profile.competitors } : {}),
          ...(profile.platforms ? { platforms: profile.platforms } : {}),
          ...(profile.socialUrls ? { socialUrls: profile.socialUrls } : {}),
        })
        .onConflictDoUpdate({
          target: tenantProfiles.tenantId,
          set: {
            description: profile.description,
            audience: profile.audience,
            voice: profile.voice,
            website: profile.website,
            ...(profile.goals ? { goals: profile.goals } : {}),
            ...(profile.competitors ? { competitors: profile.competitors } : {}),
            ...(profile.platforms ? { platforms: profile.platforms } : {}),
            ...(profile.socialUrls ? { socialUrls: profile.socialUrls } : {}),
            updatedAt: new Date(),
          },
        });
      // The RESEARCH crew analyzes rows in the `competitors` watch table — the
      // profile's name list alone is never read by the arms. Keep them in sync:
      // add new names, re-enable returning ones, stop watching removed ones
      // (never delete — alerts/snapshots cascade off these rows).
      if (profile.competitors) {
        const wanted = [...new Set(profile.competitors.map((n) => n.trim()).filter(Boolean))];
        const wantedLower = new Set(wanted.map((n) => n.toLowerCase()));
        const existing = await tx
          .select({ id: competitors.id, name: competitors.name, watchEnabled: competitors.watchEnabled })
          .from(competitors)
          .where(eq(competitors.tenantId, tenantId));
        const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
        for (const name of wanted) {
          const found = byName.get(name.toLowerCase());
          if (!found) {
            await tx.insert(competitors).values({ tenantId, name });
          } else if (!found.watchEnabled) {
            await tx.update(competitors).set({ watchEnabled: true, updatedAt: new Date() }).where(eq(competitors.id, found.id));
          }
        }
        for (const c of existing) {
          if (c.watchEnabled && !wantedLower.has(c.name.toLowerCase())) {
            await tx.update(competitors).set({ watchEnabled: false, updatedAt: new Date() }).where(eq(competitors.id, c.id));
          }
        }
      }
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

  // Upload the tenant logo (raw image body, ≤2MB, png/jpeg/webp) — members only.
  app.put(
    '/tenants/:id/logo',
    { preHandler: hooks.requireTenantMember, bodyLimit: LOGO_MAX_BYTES },
    async (req, reply) => {
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      if (!LOGO_MIME_TYPES.includes(mime) || !Buffer.isBuffer(req.body)) {
        return reply.code(415).send({ error: `logo must be one of: ${LOGO_MIME_TYPES.join(', ')}` });
      }
      const logo = req.body;
      const tenantId = req.tenantId!;
      const userId = req.session!.userId;
      await db.withTenant(tenantId, async (tx) => {
        await tx
          .insert(tenantProfiles)
          .values({ tenantId, logo, logoMime: mime })
          .onConflictDoUpdate({
            target: tenantProfiles.tenantId,
            set: { logo, logoMime: mime, updatedAt: new Date() },
          });
        await emitEvent(tx, tenantId, {
          actorType: 'user',
          actorId: userId,
          category: 'tenant',
          action: 'tenant.logo_updated',
          resourceType: 'tenant_profile',
          resourceId: tenantId,
          message: `logo updated (${mime}, ${logo.length} bytes)`,
        });
      });
      return reply.send({ tenantId });
    },
  );

  // Serve the tenant logo — members only (the SPA fetches it with auth headers).
  app.get('/tenants/:id/logo', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const tenantId = req.tenantId!;
    const row = await db.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ logo: tenantProfiles.logo, logoMime: tenantProfiles.logoMime })
        .from(tenantProfiles)
        .where(eq(tenantProfiles.tenantId, tenantId));
      return rows[0];
    });
    if (!row?.logo || !row.logoMime) return reply.code(404).send({ error: 'no logo' });
    return reply.type(row.logoMime).send(row.logo);
  });
}

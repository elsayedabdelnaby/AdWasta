import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import type { Vault } from '../../credentials/vault.js';
import { platformConnections } from '../../db/schema/platform-connections.js';
import { emitAudit } from '../../observability/events.js';
import { SUPPORTED_PLATFORMS, resolveAdapter } from '../../adapters/registry.js';
import { getCredentialRequirements } from '../../credentials/schemas/index.js';

// browser_publish_enabled is intentionally NOT accepted (reserved, ADR-001), and
// publishMode is limited to the two live values — 'browser' is rejected by the enum.
const PatchSchema = z
  .object({
    publishMode: z.enum(['copy_pack', 'api']).optional(),
    apiPublishEnabled: z.boolean().optional(),
    apiReplyEnabled: z.boolean().optional(),
    apiDmReplyEnabled: z.boolean().optional(),
    apiEmailEnabled: z.boolean().optional(),
    imageGenEnabled: z.boolean().optional(),
  })
  .strict();

function assertSupportedPlatform(platform: string): void {
  if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(platform)) {
    const err = new Error(`unsupported platform: ${platform}`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
}

export function registerPlatformRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks; vault: Vault },
): void {
  const { db, hooks, vault } = deps;

  app.patch(
    '/tenants/:id/platforms/:platform',
    { preHandler: hooks.requireTenantMember },
    async (req, reply) => {
      const { platform } = req.params as { platform: string };
      assertSupportedPlatform(platform);
      const patch = PatchSchema.parse(req.body);
      const tenantId = req.tenantId!;

      const connection = await db.withTenant(tenantId, async (tx) => {
        const rows = await tx
          .insert(platformConnections)
          .values({ tenantId, platform, ...patch })
          .onConflictDoUpdate({
            target: [platformConnections.tenantId, platformConnections.platform],
            set: { ...patch, updatedAt: new Date() },
          })
          .returning();
        await emitAudit(tx, tenantId, {
          actorType: 'user',
          actorId: req.session!.userId,
          category: 'toggle',
          action: 'platform.settings_updated',
          resourceType: 'platform_connection',
          resourceId: platform,
          message: `platform ${platform} settings updated`,
          payload: { platform, ...patch },
        });
        return rows[0]!;
      });

      const requirements =
        connection.apiPublishEnabled ? getCredentialRequirements(platform) : undefined;
      return reply.send({
        connection,
        credentialRequirements: requirements
          ? { fields: requirements.fields }
          : undefined,
      });
    },
  );

  app.post(
    '/tenants/:id/platforms/:platform/credentials',
    { preHandler: hooks.requireTenantMember },
    async (req, reply) => {
      const { platform } = req.params as { platform: string };
      assertSupportedPlatform(platform);
      const requirements = getCredentialRequirements(platform);
      if (!requirements) {
        return reply.code(400).send({ error: `no credential schema for ${platform}` });
      }
      const creds = requirements.schema.parse(req.body); // ZodError -> 400
      const tenantId = req.tenantId!;

      await vault.saveCredentials(tenantId, platform, creds as Record<string, unknown>);

      // health-check stub via the api adapter (design §10; Phase 8 makes it real)
      const adapter = resolveAdapter(platform, {
        publishMode: 'api',
        apiPublishEnabled: true,
        browserPublishEnabled: false,
      });
      const health = await adapter.healthCheck(tenantId);

      await db.withTenant(tenantId, (tx) =>
        emitAudit(tx, tenantId, {
          actorType: 'user',
          actorId: req.session!.userId,
          category: 'credential',
          action: 'credential.saved',
          resourceType: 'credentials',
          resourceId: platform,
          message: `credentials saved for ${platform}`,
          payload: { platform }, // never the secret values
        }),
      );

      return reply.send({ saved: true, health });
    },
  );
}

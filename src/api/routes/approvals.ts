import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { approvalQueue } from '../../db/schema/approval-queue.js';
import { contentDrafts } from '../../db/schema/content-drafts.js';
import { emitAudit } from '../../observability/events.js';
import { applyUtm } from '../../arms/content/utm.js';

export function registerApprovalRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  // The approval inbox — pending items grouped by kind (design §3.5).
  app.get('/tenants/:id/approvals', { preHandler: hooks.requireTenantMember }, async (req) => {
    const tenantId = req.tenantId!;
    const rows = await db.withTenant(tenantId, (tx) =>
      tx.select().from(approvalQueue).where(eq(approvalQueue.status, 'pending')).orderBy(desc(approvalQueue.createdAt)),
    );
    const group = (kind: string) => rows.filter((r) => r.kind === kind);
    return { posts: group('post'), emails: group('email'), images: group('image'), all: rows };
  });

  const DecideBody = z.object({
    decision: z.enum(['approve', 'reject', 'edit']),
    edits: z.object({ body: z.string().optional(), subject: z.string().optional(), preheader: z.string().optional() }).optional(),
  });

  app.post('/tenants/:id/approvals/:approvalId/decide', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const { approvalId } = req.params as { approvalId: string };
    const { decision, edits } = DecideBody.parse(req.body);
    const tenantId = req.tenantId!;
    const userId = req.session!.userId;

    const result = await db.withTenant(tenantId, async (tx) => {
      const [approval] = await tx.select().from(approvalQueue).where(eq(approvalQueue.id, approvalId));
      if (!approval) return { notFound: true as const };

      if (decision === 'edit') {
        // Edit the draft in place; leave the item pending for a subsequent approve.
        if (approval.resourceType === 'content_draft' && edits) {
          const [draft] = await tx.select({ campaignId: contentDrafts.campaignId }).from(contentDrafts).where(eq(contentDrafts.id, approval.resourceId));
          const campaignKey = draft?.campaignId ?? approval.resourceId; // preserve the campaign attribution
          const set: Record<string, unknown> = { updatedAt: new Date() };
          if (edits.body !== undefined) set.body = applyUtm(edits.body, campaignKey, approval.resourceId);
          if (edits.subject !== undefined) set.subject = edits.subject;
          if (edits.preheader !== undefined) set.preheader = edits.preheader;
          await tx.update(contentDrafts).set(set).where(eq(contentDrafts.id, approval.resourceId));
        }
        // Stays pending so the human can approve after editing; edit is audited.
        await emitAudit(tx, tenantId, { actorType: 'user', actorId: userId, category: 'approval', action: 'draft.edited', resourceType: approval.resourceType, resourceId: approval.resourceId, message: 'draft edited' });
        return { ok: true as const };
      }

      const approvalStatus = decision === 'approve' ? 'approved' : 'rejected';
      await tx.update(approvalQueue).set({ status: approvalStatus, decidedBy: userId, decidedAt: new Date() }).where(eq(approvalQueue.id, approvalId));
      if (approval.resourceType === 'content_draft') {
        await tx.update(contentDrafts).set({ status: approvalStatus, updatedAt: new Date() }).where(and(eq(contentDrafts.id, approval.resourceId), eq(contentDrafts.tenantId, tenantId)));
      }
      await emitAudit(tx, tenantId, { actorType: 'user', actorId: userId, category: 'approval', action: `draft.${approvalStatus}`, resourceType: approval.resourceType, resourceId: approval.resourceId, message: `${approval.kind} ${approvalStatus}` });
      return { ok: true as const };
    });

    if ('notFound' in result) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}

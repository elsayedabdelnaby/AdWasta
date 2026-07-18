import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { AuthHooks } from '../../auth/hook.js';
import { schedules } from '../../db/schema/schedules.js';
import { scheduleItem, fireReminder, executeSchedule } from '../../arms/scheduler/schedule.js';

export function registerCalendarRoutes(
  app: FastifyInstance,
  deps: { db: Db; hooks: AuthHooks },
): void {
  const { db, hooks } = deps;

  app.get('/tenants/:id/calendar', { preHandler: hooks.requireTenantMember }, async (req) => {
    const rows = await db.withTenant(req.tenantId!, (tx) =>
      tx.select().from(schedules).orderBy(asc(schedules.scheduledAt)).limit(200),
    );
    return { schedules: rows };
  });

  const CreateBody = z.object({
    draftId: z.string().uuid().optional(),
    type: z.enum(['social_post', 'email_send']),
    platform: z.string().optional(),
    scheduledAt: z.string().datetime(),
    armed: z.boolean().optional(),
  });
  app.post('/tenants/:id/calendar', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const id = await scheduleItem(db, req.tenantId!, { ...body, scheduledAt: new Date(body.scheduledAt) });
    return reply.code(201).send({ id });
  });

  app.post('/tenants/:id/schedules/:scheduleId/arm', { preHandler: hooks.requireTenantMember }, async (req, reply) => {
    const { scheduleId } = req.params as { scheduleId: string };
    const [row] = await db.withTenant(req.tenantId!, (tx) =>
      tx.update(schedules).set({ armed: true, updatedAt: new Date() }).where(eq(schedules.id, scheduleId)).returning({ id: schedules.id }),
    );
    if (!row) return reply.code(404).send({ error: 'not found' });
    return { armed: true };
  });

  app.post('/tenants/:id/schedules/:scheduleId/remind', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { scheduleId } = req.params as { scheduleId: string };
    return { reminded: await fireReminder(db, req.tenantId!, scheduleId) };
  });

  app.post('/tenants/:id/schedules/:scheduleId/execute', { preHandler: hooks.requireTenantMember }, async (req) => {
    const { scheduleId } = req.params as { scheduleId: string };
    return executeSchedule(db, req.tenantId!, scheduleId);
  });
}

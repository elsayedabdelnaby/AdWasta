import { and, sql, sum, gte, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { agentTraces } from '../db/schema/agent-traces.js';
import { tenants } from '../db/schema/tenants.js';
import { systemEvents } from '../db/schema/system-events.js';
import { emitEvent } from '../observability/events.js';
import { UserFixableError } from './error-handler.js';

export interface BudgetConfig {
  DAILY_BUDGET_USD: number;
  MONTHLY_BUDGET_USD: number;
  MAX_RUN_COST_USD: number;
}

/**
 * Harness-enforced budget hard stop (design §6.1). Sums this tenant's trace cost
 * for today and this month — in the TENANT's timezone — and refuses to proceed
 * past the caps, emitting budget.hard_stop (at most once per tenant-day). Also
 * aborts a single run once its accumulated cost exceeds MAX_RUN_COST_USD. These
 * caps meter and STOP spend; they are enforced here, not by any tracing tool.
 */
export async function assertWithinBudget(
  db: Db,
  tenantId: string,
  config: BudgetConfig,
  opts: { runCostSoFar?: number } = {},
): Promise<void> {
  if (opts.runCostSoFar !== undefined && opts.runCostSoFar >= config.MAX_RUN_COST_USD) {
    throw new UserFixableError(
      `run cost $${opts.runCostSoFar.toFixed(2)} exceeded MAX_RUN_COST_USD $${config.MAX_RUN_COST_USD}`,
    );
  }

  const over = await db.withTenant(tenantId, async (tx) => {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId));
    const zone = t?.tz ?? 'UTC';
    // instant of the tenant-local day/month boundary, as a timestamptz
    const dayStart = sql`date_trunc('day', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone}`;
    const monthStart = sql`date_trunc('month', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone}`;

    const [day] = await tx
      .select({ s: sum(agentTraces.totalCostUsd) })
      .from(agentTraces)
      .where(gte(agentTraces.createdAt, dayStart));
    const [month] = await tx
      .select({ s: sum(agentTraces.totalCostUsd) })
      .from(agentTraces)
      .where(gte(agentTraces.createdAt, monthStart));

    const daily = Number(day?.s ?? 0);
    const monthly = Number(month?.s ?? 0);
    if (daily < config.DAILY_BUDGET_USD && monthly < config.MONTHLY_BUDGET_USD) return null;

    // Emit budget.hard_stop at most once per tenant-day (avoid event floods).
    const existing = await tx
      .select({ id: systemEvents.id })
      .from(systemEvents)
      .where(and(eq(systemEvents.action, 'budget.hard_stop'), gte(systemEvents.createdAt, dayStart)))
      .limit(1);
    if (existing.length === 0) {
      await emitEvent(tx, tenantId, {
        actorType: 'system',
        category: 'budget',
        action: 'budget.hard_stop',
        severity: 'critical',
        message: `budget hard stop (daily $${daily.toFixed(2)}, monthly $${monthly.toFixed(2)})`,
        payload: { daily, monthly, dailyCap: config.DAILY_BUDGET_USD, monthlyCap: config.MONTHLY_BUDGET_USD },
      });
    }
    return { daily, monthly };
  });

  if (over) {
    throw new UserFixableError(
      `budget hard stop: daily $${over.daily.toFixed(2)}/${config.DAILY_BUDGET_USD}, monthly $${over.monthly.toFixed(2)}/${config.MONTHLY_BUDGET_USD}`,
    );
  }
}

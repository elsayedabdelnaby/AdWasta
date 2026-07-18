# Deploy & production checklist

Deploy hardening for AdWasta (Phase 10, Task 10.3). See also `docs/docker.md`
(containers) and `docs/security.md` (isolation + credential runbook).

## Pre-tag gate

- [ ] `npm test` green and `npm run build` clean.
- [ ] `npm run evals:run` (all pillars) exits 0 — ≥90% pass rate, no regression
      beyond 5% vs the last `eval_runs` baseline.
- [ ] `/code-review` on the release diff, real findings resolved.

## Database

- [ ] Managed PostgreSQL with **point-in-time recovery** (or self-hosted pgBackRest
      + WAL archiving). This is the backup/PITR item deferred from Phase 0.
- [ ] App connects as the **non-superuser, non-BYPASSRLS `app_user` role**
      (`DATABASE_URL`); migrations run as the owner (`DATABASE_ADMIN_URL`).
      Verify `rolsuper=f, rolbypassrls=f` on `app_user` (see security.md).
- [ ] `npm run db:migrate` applied; RLS enabled on every tenant table.

## Secrets & config

- [ ] `CREDENTIALS_MASTER_KEY` (32-byte base64) in the platform secret manager,
      never committed. Rotation runbook in `docs/security.md`.
- [ ] `AUTH_PROVIDER=workos` with real `WORKOS_*` keys (dev provider is refused in
      production by `createSessionProvider`).
- [ ] `CORS_ORIGINS` set to the real dashboard origin(s) — never a wildcard with
      credentials.
- [ ] Budget caps set: `DAILY_BUDGET_USD`, `MONTHLY_BUDGET_USD`, `MAX_RUN_COST_USD`
      (harness-enforced hard stops, design §6.1).

## Runtime

- [ ] Per-tenant rate limiting backed by Redis (`@fastify/rate-limit`); enable
      Fastify `trustProxy` behind a load balancer so IP keying is correct.
- [ ] `/healthz` (liveness) + `/readyz` (Postgres/Redis/queue) wired to the
      orchestrator's probes; health endpoints are exempt from rate limiting.
- [ ] TLS terminated in front of `web` (Caddy/Traefik/Cloudflare); Postgres and
      Redis not published to the host in prod compose.

## Canary deploy

1. Deploy the new tag to a **single canary instance** behind the load balancer,
   taking a small % of traffic (or one internal tenant).
2. Watch for 10–15 min: `/readyz` stays green; error rate and P95 latency per arm
   (from `agent_traces`) within norms; no `budget.hard_stop` or
   `*.execution_blocked` spikes in `system_events`.
3. Run one real approve-loop end to end against the canary.
4. If clean, roll out to the fleet; else roll back the tag (DB migrations are
   additive — a rollback of app code is safe without a down-migration).

## Post-deploy

- [ ] Confirm a fresh `eval_runs` row per pillar recorded by CI.
- [ ] Verify no credentials/PII appear in `system_events` / `agent_traces`
      (spot-check the activity feed).

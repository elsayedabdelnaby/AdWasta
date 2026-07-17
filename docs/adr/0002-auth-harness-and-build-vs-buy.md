# ADR-002 — Authentication, harness engine, and build-vs-buy

**Status:** Proposed — decisions 1, 2, 3 confirmed by owner 2026-07-17; decision 4 pending
**Date:** 2026-07-17
**Evidence:** `docs/research/salvaged/` (25 primary-source reports)
**Depends on:** ADR-001 (browser publishing deferred)

---

## Decision 1 — Authentication is missing entirely; add WorkOS AuthKit in Phase 0

### The gap

**There is no authentication anywhere in Phases 0-10.** No login, no session model, no token scheme. `design.md` §24 punts "multi-user RBAC" to v2 without mentioning even single-user login. Every endpoint — `POST /tenants`, `PATCH /tenants/:id/platforms/:platform` — is undefined as to *who may call it*.

### Why RLS does not close this

`design.md` §7 (branch `fable5-reviewing`) added **Postgres Row-Level Security from day one**, keyed on an `app.tenant_id` session variable set per request/job. That is a genuine improvement and should stay.

**But RLS is authorization, not authentication — it is a lock with no door.** The policy enforces "this session may only touch rows for `app.tenant_id`." Nothing in the plan establishes *which tenant the caller actually is*. Today the only candidate input is the `:id` path parameter, so `GET /tenants/:id/...` would set `app.tenant_id` from a value the caller supplies — and RLS would faithfully enforce isolation for whatever tenant the attacker names. Two-layer isolation over an unauthenticated identity is one layer with extra steps.

### Why it is still urgent under copy_pack-only

The original framing was "it stores customers' social credentials." Under ADR-001 + copy_pack-only, **v1 stores no platform credentials** — that materially shrinks the security surface, and the argument must be made honestly on other grounds:

1. **Cross-tenant data exposure.** Every tenant's strategy, competitor intel, personas, and drafts are readable by anyone who guesses a `tenant_id`.
2. **LLM cost abuse.** Unauthenticated endpoints trigger LLM runs. Anyone can burn the OpenRouter budget — and the per-tenant budget caps in §6.1 meter spend, they don't authenticate the spender.

### Decision

**WorkOS AuthKit** (free to 1M MAU; Organizations and roles map onto the tenant model; SSO/SCIM available as enterprise tenants arrive). New **Task 0.3a**, before the Tenant API.

**The load-bearing rule:** every route resolves `tenant_id` **from the session**, and `app.tenant_id` is set from that resolved value — never from a path parameter. Phase 0 gate: an unauthenticated request to any tenant route returns 401.

---

## Decision 2 — API publish deferred to v2; Ayrshare when it returns

Building Facebook Graph + X API v2 + email adapters means OAuth, token refresh, webhooks, and app review *per platform* — engineering-months before a single post ships.

**Deferred to v2.** v1 ships copy_pack only; humans paste. Combined with ADR-001, **v1 has no external write path at all** — zero ToS risk, zero ban risk, zero platform onboarding on the critical path. The `PlatformAdapter` scaffold (Task 0.6) is unchanged and carries the "API adapters are scaffolded early; activation is config + credentials only" non-negotiable on its own.

**When v2 needs it: buy, don't build.** [Ayrshare](../research/salvaged/research-ayrshare-publishing-api-service.md) Business (~$599/mo, 30 profiles, then $2.49-8.99/extra) is shaped exactly like this product — agencies/SaaS managing many customers' accounts. Tenants OAuth their own accounts through a white-label JWT flow, so **we never touch Meta/X app review and never store platform tokens**. 13 networks, per-tenant profile isolation, 300 req/5min per profile (won't bind on an approval-gated flow). Implement it *behind* `PlatformAdapter` so it stays swappable.

Note the interaction with §6.1 unit economics: at ~$2-9/tenant/month, Ayrshare is 10-25% of the modeled $25-35 tenant cost — material, but far cheaper than the engineering it replaces, and it lands inside the ≥3× pricing floor.

**Rejected: Postiz.** Closest architectural match (Node/TS, multi-tenant orgs, 30+ networks, 33.4k stars, actively released) and **AGPL-3.0 with no exception**. §13 means: modify it, expose it to tenants over a network, and every tenant is owed your fork's source. That is the whole product. Arms-length HTTP calls to an unmodified instance avoid the trigger but reintroduce the infra we're avoiding (Postgres + Redis + Temporal + S3).

**Survey result:** the OSS social-scheduler space is overwhelmingly PHP/Laravel (Mixpost, TryPost, Shoutrrr). Mixpost's Pro license *contractually forbids* building a SaaS on it. Bulkit.dev (Apache-2.0, TS) was archived April 2026. Shoutify is pre-functional. **There is no permissively-licensed, maintained, Node/TS, multi-tenant scheduler to embed.**

---

## Decision 3 — Mastra adopted selectively (workflows + HITL only)

`design.md` locks supervisor + typed handoffs + HITL approval gates + resumable state. [Mastra](../research/salvaged/research-mastra-for-agent-orchestration.md) (Apache-2.0, ~26.3k stars, v1.51, ~1.15M weekly downloads, ex-Gatsby team, $35M raised) implements exactly that:

- **HITL suspend/resume as a first-class primitive** — `suspend()` / `run.resume({step, resumeData: {approved: true}})` with `suspendSchema`/`resumeSchema`, plus `bail()` for rejection. **That is the approval inbox**, and it is the hardest part of the harness.
- **Supervisor agents** — typed-tool-call delegation over an `agents: {}` map.
- **Durable storage** — Postgres adapter; state survives process restart.

**Scope: workflows + HITL + durable state only.** Arms stay plain TS + OpenRouter; model routing (Task 0.5.1), the ReAct loop (0.5.2), and the risk assessor (0.5.4) stay hand-rolled. This captures the largest win with the least lock-in to a framework publishing at high velocity (1,396 npm versions since Oct 2024).

**Required before committing:** audit which features sit under `ee/`. The Mastra EE license forbids production use without a paid agreement.

**Rejected: Trigger.dev** (Apache-2.0/MIT, genuinely good) — it does not solve the problem we'd adopt it for. Its own Playwright docs confirm checkpointing happens at *waitpoints*, not per-line, and a checkpoint cannot serialize a live browser process; the documented pattern **closes the browser at `onWait` and relaunches at `onResume`**. We'd still hand-roll step resume, just inside their hooks — while adding a second Postgres + Redis + orchestrator stack. BullMQ is already here. (Moot for publishing under ADR-001, but the conclusion holds for arm runs generally.)

---

## Decision 4 — Observability: Langfuse Cloud (pending owner confirmation)

[Langfuse](../research/salvaged/research-langfuse-license-and-features.md) core is **MIT**, and got *more* permissive in June 2025 (LLM-as-a-judge evals, annotation queues, prompt experiments, Playground moved EE → MIT). Organizations → Projects → scoped API keys is free OSS — that is per-tenant separation, not EE-gated. Only SCIM, audit logs, and project-level custom RBAC remain EE.

**Cloud, not self-hosted, for v1.** Self-hosting needs Postgres + ClickHouse + Redis + S3 — too heavy for this MVP. Hobby is free (50k units/mo); Core is $29/mo.

**Known gap, already solved elsewhere in the design:** Langfuse has no per-tenant LLM-spend cap or budget alert (Spend Alerts are Cloud-only and org-wide). This would have been a blocker — except `design.md` §6.1 already specifies harness-enforced hard caps (`DAILY_BUDGET_USD`, `MONTHLY_BUDGET_USD`, `MAX_RUN_COST_USD`) with hard-stop behavior. **Those caps must stay in the harness regardless of Langfuse.** Langfuse is for tracing and evals; §6.1 is for enforcement. Keep the thin `agent_traces` rollup as the source of truth for per-tenant cost attribution.

---

## Consequences

- Phase 0 grows: auth (Task 0.3a), per-tenant rate limiting (`@fastify/rate-limit` + Redis, `keyGenerator` → `tenantId`), health/readiness (`select 1` + `redis.ping()` + BullMQ queue depth), backup/PITR (pgBackRest + WAL archiving, or managed PITR).
- Phase 8 (API adapters) → v2, scaffold retained. Phase 7 → deferred per ADR-001.
- Phase 0.5 Task 0.5.6 (campaign pipeline) and the approval path are rewritten against Mastra primitives.
- Still open, not addressed by any decision here: tenant-level GDPR export/erasure (`system_events` "forever" retention would hold PII indefinitely — needs a `contains_pii` flag + per-category retention override), and credential rotation (the branch added envelope encryption with per-tenant DEKs, but no rotation schedule or expiry).

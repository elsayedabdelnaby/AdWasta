# AdWasta — Implementation Plan

> **For agentic workers:** one phase per context — ready-made prompt in `docs/phase-prompt.md`. Gate every phase (design §19): pressure-test the slice against `design.md` + `docs/adr/` → implement test-first (`superpowers:test-driven-development`) → verify with real output (`superpowers:verification-before-completion`, `npm test`, `npm run build`, the phase's own gate line) → `/code-review` the diff → stop and report. Run the eval suite where noted before sign-off.

**Goal:** Ship a **Supervised Crew** AdWasta: thin Brain supervisor + specialist crews (Research, Strategy, Creation, Ops, Measure), five-pillar cycle with a performance feedback loop, human-gated publish, production harness.

**Architecture (locked):** Supervisor Brain routes campaigns. **No chatty multi-agent.** Crews hand off typed `ArmResult` to DB. RESEARCH runs parallel; STRATEGY sequential; CREATION ReAct; OPS deterministic + human gates; MEASURE = deterministic stats pipeline + Analyst arm that interprets only. Ten arms, five crews, lazy tools, model routing, evals, traces.

**Tech stack:** Node 22, TypeScript, Fastify, PostgreSQL (with RLS), Drizzle, BullMQ, Redis, Playwright MCP (dev/QA only — ADR-001), OpenRouter (routed tiers), Vite + React dashboard.

**Design reference:** `docs/design.md` v3.1 — Supervised Crew, five pillars (incl. MEASURE §12.2), harness, evals.

## Locked architecture (do not change without ADR)

| Topic | Decision |
|-------|----------|
| Topology | **Supervised Crew** — Brain supervises; specialists do not chat in one thread |
| Rejected | Single mega-prompt agent; chatty CrewAI-style collaboration |
| Handoffs | `ArmResult` → PostgreSQL; max ~2k token summary between crews |
| RESEARCH | Parallel: Market + Trend + Competitor (`Promise.all`) |
| STRATEGY | Sequential: ICP → personas → angles → plan |
| CREATION | ReAct inside Content arm; visual briefs; optional Nano Banana images |
| OPS | Deterministic workflow; human approval before publish/reply/send |
| MEASURE | Deterministic metrics pipeline in code (`src/metrics/`); **Analyst arm** interprets only; insights must cite `post_metrics` rows |
| Publish default | Copy pack (zero account risk); official API adapters toggled per tenant (R3) |
| Browser publish | **Deferred post-v1 — ADR-001** (design §10.0); flag reserved; Playwright MCP for Cursor QA/demos only |
| Releases | R1 validation slice (Phases 0–3.5 + thin UI, one platform) → R2 operations → R3 automation (design §23) |
| Tenant isolation | Middleware `tenant_id` + **Postgres RLS from Phase 0.2** |
| Credential crypto | Envelope encryption: KEK (`CREDENTIALS_MASTER_KEY`) → per-tenant DEKs; KMS-ready |
| Competitor data | ToS-safe tiers (SERP/web/RSS/pasted) + optional paid provider adapter — no social scraping (design §12) |
| Prompts | Versioned (`PROMPT_VERSION` logged in traces); prompt change requires eval re-run |
| UI personas | Alex (Research), Sam (Strategy), Jordan (Creation), Ops, Riley (Measure) |

## Marketing cycle — execution map

Every implementation phase maps to one pillar. Ship-loop + pillar skills gate each phase.

```
┌───────────────┬─────────────────┬──────────────┬────────────┬──────────────┐
│ 1. RESEARCH   │ 2. STRATEGY     │ 3. CREATION  │ 4. OPS     │ 5. MEASURE   │
│ Market / SERP │ ICP / Personas  │ Copywriting  │ Email      │ Metrics      │
│ Competitors   │ Angles / Hooks  │ Visuals      │ Social     │ Insights     │
└───────────────┴─────────────────┴──────────────┴────────────┴──────────────┘
     Phase 1          Phase 2          Phase 3      Phases 4–8    Phase 3.5
                                                                  (+ Phase 8 webhooks)
```

| Phase | Pillar | Delivers | Skills at gate |
|-------|--------|----------|----------------|
| 0, 0.5 | (foundation) | Harness, DB, jobs, traces | completion gate |
| **1** | **RESEARCH** | Market/SERP + trends + competitors + **campaign watch/alerts** | intel vs profile; completion gate |
| **2** | **STRATEGY** | ICP, personas, angles/hooks, plan + **counter-campaign angles** | strategy vs profile; completion gate |
| **3** | **CREATION** | Posts/campaign drafts + visuals + optional Nano Banana (+ counter posts) + **UTM tagging + published_items anchor** | `verify` skill; completion gate |
| **3.5** | **MEASURE** | Metrics schema + import, deterministic stats, Analyst arm + weekly job, angle scoring, feedback wiring | insights vs metric rows; completion gate |
| **4** | **OPS** | Daily strategist (email + social, consumes `performance_insights`) | completion gate |
| **5** | **OPS** | Scheduler (email + social calendar) | completion gate |
| **6** | **OPS** | Comments + DM reply drafts | completion gate |
| ~~7~~ | ~~OPS~~ | ~~Browser publisher~~ — **deferred post-v1 (ADR-001)** | — |
| **8** | **OPS** | API adapters (social + email, toggled) | completion gate |
| **9** | (UI) | 5-pillar dashboard + Performance page + traces | `verify` skill |
| **10** | (hardening) | Eval CI | completion gate |

---

## Global Constraints

- Multi-tenant from day one: **one shared Postgres**; every table has `tenant_id` (not DB-per-customer)
- **Every route authenticates (WorkOS AuthKit); `tenant_id` resolves from the session, never from a path param — `app.tenant_id` is set from that resolved value (design §7.2, ADR-002).** RLS without authentication is a lock with no door
- No publish or reply (comment or DM) without explicit approval in v1
- `require_approval_for_publish` and `require_approval_for_reply` are always true in v1
- Separate toggles: `api_reply_enabled` (comments) vs `api_dm_reply_enabled` (DMs)
- Default publish mode: `copy_pack`; `api` off until tenant enables; `browser` deferred post-v1 (ADR-001)
- API adapters fully scaffolded in v1 (interface, credential schema, health check, stub) — activation is config only
- Credentials: envelope encryption (KEK → per-tenant DEK); never commit secrets; rotation runbook in `docs/security.md`
- Postgres RLS enabled on every tenant table from Phase 0.2 (defense-in-depth with middleware `tenant_id`)
- Run the completion gate (design §19) at every phase; one phase per context
- Competitor intel: ToS-safe sources only (SERP, competitor sites/RSS, pasted intel, optional paid provider adapter) — never login-gated social scraping (design §12)
- Playwright MCP only for build/QA/demos — not the product runtime
- Model proposes actions; harness permits them (permission layer separate from LLM)
- HIGH-risk actions (`post_public`, `reply_comment`, `reply_message`, `publish`, `send_email`) always require human approval
- Lazy tool loading: only arm-relevant tools in each LLM call
- Arm handoffs return `ArmResult` summaries (≤2k tokens), not chat logs between agents
- Crews do not share one LLM conversation thread
- Intel snapshots require `citations[]`; fail eval without them
- External web/social content is untrusted — sanitize before context injection
- Every outbound link in drafts gets UTM params: `utm_campaign=campaign_id`, `utm_content=draft_id` (always on)
- LLM never computes performance stats — engagement rate, CTR, deltas, baselines live in `src/metrics/` (code, unit-tested)
- `performance_insights` must cite `post_metrics` row ids; below min sample (5 items per angle/format) → tagged `provisional` and excluded from Strategy/Creation prompts
- Copy-pack publishes are anchored via **Mark as published** → `published_items` (no anchor, no metrics)
- Eval deploy gate: ≥ 90% pass rate on golden fixtures before phase sign-off (where evals exist)
- Max 10 ReAct steps per arm loop; max 2 retries on transient errors
- Every LLM call logs to `agent_traces` (model, tokens, cost, latency, `prompt_version`)
- Budget caps harness-enforced: `DAILY_BUDGET_USD` + `MONTHLY_BUDGET_USD` hard stop; `MAX_RUN_COST_USD` aborts a run mid-loop (design §6.1)
- ≥10 hand-authored golden fixtures per arm **before** that arm's phase starts; deterministic rules blocking day one; LLM-judge scores advisory until ≥25 fixtures exist (design §17)
- Email send (R3) requires: consent attestation, unsubscribe link, suppression-list gate, SPF/DKIM/DMARC docs (design §21) — Publisher refuses sends to suppressed addresses

---

## File structure (target)

```
marketing-agent/
├── README.md
├── package.json
├── .env.example
├── drizzle.config.ts
├── src/
│   ├── index.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── model-routing.ts
│   ├── db/
│   │   ├── schema/
│   │   └── migrations/
│   ├── harness/
│   │   ├── types.ts              # ArmResult, ArmError, RiskLevel
│   │   ├── react-loop.ts         # TAO loop with step cap
│   │   ├── context-selector.ts
│   │   └── error-handler.ts      # 4 error classes
│   ├── brain/
│   │   ├── supervisor.ts         # Campaign router — never redo crew work
│   │   ├── campaign-pipeline.ts  # RESEARCH → STRATEGY → CREATION orchestration
│   │   ├── research-orchestrator.ts
│   │   └── daily-strategist.ts
│   ├── crews/                    # UI personas + crew metadata
│   │   ├── types.ts              # CrewId, persona names (Alex, Sam, Jordan, Ops, Riley)
│   │   └── roster.ts
│   ├── memory/
│   │   ├── types.ts              # 4 memory types
│   │   ├── compaction.ts
│   │   └── tenant-memory.ts
│   ├── metrics/                  # MEASURE — deterministic (no LLM)
│   │   ├── stats.ts              # rates, deltas, rolling baseline, min-sample
│   │   └── import.ts             # manual/CSV + webhook ingestion
│   ├── arms/
│   │   ├── market/               # RESEARCH — SERP / keywords
│   │   ├── trends/
│   │   ├── competitors/
│   │   ├── strategy/             # STRATEGY — ICP, personas, angles
│   │   ├── content/              # CREATION — copy + visual briefs
│   │   ├── scheduler/
│   │   ├── engagement/
│   │   └── analyst/              # MEASURE — interprets stats, scores angles
│   ├── adapters/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── copy-pack/
│   │   ├── image/                # Nano Banana / Gemini (optional)
│   │   │   ├── types.ts
│   │   │   ├── nano-banana.ts
│   │   │   └── stub.ts
│   │   └── api/                  # official platform APIs (browser/ deferred — ADR-001)
│   ├── credentials/
│   │   ├── vault.ts
│   │   └── schemas/
│   ├── guardrails/
│   │   ├── risk-assessor.ts
│   │   ├── permissions.ts
│   │   └── sanitize-external.ts
│   ├── observability/
│   │   ├── trace.ts
│   │   └── cost.ts
│   ├── evals/
│   │   ├── runner.ts
│   │   ├── rules.ts
│   │   ├── judge.ts
│   │   └── fixtures/
│   ├── queue/
│   │   ├── jobs.ts
│   │   └── workers.ts
│   ├── llm/
│   │   ├── openrouter.ts
│   │   └── structured.ts
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── search-serp.ts          # RESEARCH — keywords, SERP
│   │   ├── search-web.ts
│   │   ├── fetch-web-page.ts       # competitor sites/blogs (robots.txt-respecting)
│   │   └── intel-provider.ts       # optional paid provider adapter (Apify/Bright Data)
│   └── api/routes/
├── web/
│   ├── src/pages/
│   │   ├── Dashboard.tsx         # 5-pillar overview
│   │   ├── Approvals.tsx
│   │   ├── Intel.tsx
│   │   ├── Calendar.tsx
│   │   ├── Performance.tsx       # metrics, KPI progress, insights, angle scores
│   │   ├── PlatformSettings.tsx
│   │   └── Traces.tsx
├── seeds/
│   └── demo-tenant.ts
├── evals/
│   └── fixtures/                 # golden scenarios per arm
└── tests/
```

---

## Phase 0 — Foundation + harness shell

**Goal:** Runnable monorepo, DB, tenant CRUD, feature flags, credential vault, trace shell, lazy tool registry, async job API.

### Task 0.1: Scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `src/index.ts`, `src/config/env.ts`

- [ ] Init npm workspace: TypeScript, Fastify, Drizzle, Zod, BullMQ, ioredis, vitest
- [ ] Scripts: `dev`, `build`, `test`, `db:migrate`, `db:seed`, `evals:run`
- [ ] `.env.example`: `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `CREDENTIALS_MASTER_KEY`, `MODEL_FAST`, `MODEL_BALANCED`, `MODEL_DEEP`, `TAVILY_API_KEY`

### Task 0.2: Database schema (core)

**Files:**
- Create: `src/db/schema/tenants.ts`, `tenant-profiles.ts`, `platform-connections.ts`, `credentials.ts`, `audit-log.ts`, `system-events.ts`, `agent-traces.ts`, `jobs.ts`

- [ ] `tenants`, `tenant_profiles`
- [ ] `platform_connections` (publish mode + boolean flags)
- [ ] `credentials` (encrypted JSON payload)
- [ ] `system_events` — full activity stream (design §7.1)
- [ ] `audit_log` — append-only compliance subset
- [ ] `agent_traces` (trace_id, tenant_id, arm, crew, steps JSON, cost, latency, status)
- [ ] `jobs` (async arm runs: queued | running | completed | failed)
- [ ] Indexes: `(tenant_id, created_at DESC)` on events, audit, traces
- [ ] **Enable Postgres RLS on every tenant table**: policy on `app.tenant_id` session var; Fastify middleware + BullMQ workers set it per request/job
- [ ] Isolation test: query with wrong `app.tenant_id` returns zero rows even without a WHERE clause
- [ ] Run first migration

### Task 0.2b: Event writer helper

**Files:**
- Create: `src/observability/events.ts`

- [ ] `emitEvent(...)` → insert `system_events`
- [ ] `emitAudit(...)` → insert both `audit_log` and `system_events` (same event_id)
- [ ] Strip secrets from payload (never log API keys)
- [ ] Unit test: emit + query by tenant; audit doubles into events

### Task 0.3a: Auth & tenant identity (ADR-002) — **before any tenant route**

**Files:**
- Create: `src/auth/workos.ts`, `src/auth/hook.ts`, `src/db/schema/memberships.ts`

**Why first:** Task 0.2 enables RLS on `app.tenant_id`. Nothing yet establishes *which* tenant the caller is — if `app.tenant_id` came from the `:id` path param, RLS would faithfully isolate whatever tenant an attacker names. Identity must land before isolation means anything.

- [ ] WorkOS AuthKit integration; `.env`: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`
- [ ] Map WorkOS Organization ↔ `tenants.id`; persist membership rows
- [ ] Fastify `preHandler` hook: verify session → resolve `tenantId` from membership → set `request.tenantId`
- [ ] Set Postgres `app.tenant_id` **from `request.tenantId`**, never from the URL
- [ ] `:id` routes assert the session is a member of `:id` → else 403
- [ ] BullMQ jobs carry a resolved `tenantId` from enqueue; workers set `app.tenant_id` from the job record, never from job input
- [ ] Integration tests: unauthenticated → **401**; authenticated but non-member of `:id` → **403**; cross-tenant read returns zero rows even with RLS deliberately disabled (proves both layers)

### Task 0.3: Tenant API

**Files:**
- Create: `src/api/routes/tenants.ts`

- [ ] `POST /tenants`, `GET /tenants/:id` — all behind the Task 0.3a auth hook
- [ ] `POST /tenants/:id/onboard` with Zod profile validation
- [ ] Integration test: create tenant + onboard

### Task 0.4: Credential vault

**Files:**
- Create: `src/credentials/vault.ts`, `src/credentials/schemas/facebook.ts`, `twitter.ts`

- [ ] **Envelope encryption**: `CREDENTIALS_MASTER_KEY` (KEK) encrypts one DEK per tenant; secrets encrypted AES-256-GCM with the tenant DEK
- [ ] KMS-ready interface (`KeyProvider`): env KEK now, AWS KMS / Vault later without schema change
- [ ] `rotateKek()` re-encrypts DEKs only; `rotateTenantDek(tenantId)` re-encrypts one tenant's rows; runbook in `docs/security.md`
- [ ] `saveCredentials(tenantId, platform, payload)` / `getCredentials()`
- [ ] Credentials never appear in logs or traces
- [ ] Unit tests: round-trip, KEK rotation, cross-tenant DEK misuse fails

### Task 0.5: Platform settings API

**Files:**
- Create: `src/api/routes/platforms.ts`

- [ ] `PATCH /tenants/:id/platforms/:platform` — flags + `publish_mode`
- [ ] When `api_publish_enabled` → return `credential_requirements` schema
- [ ] `POST .../credentials` → validate → encrypt → save → health check stub

### Task 0.6: Adapter registry

**Files:**
- Create: `src/adapters/types.ts`, `src/adapters/registry.ts`

- [ ] `PlatformAdapter` interface
- [ ] Register copy-pack + api stubs per platform (`browser` mode id reserved — ADR-001)
- [ ] `resolveAdapter(tenantId, platform, mode)` respects flags

### Task 0.7: Async job API

**Files:**
- Create: `src/queue/jobs.ts`, `src/api/routes/jobs.ts`

- [ ] `POST /tenants/:id/jobs` — enqueue `{ arm, input }`, return `job_id`
- [ ] `GET /jobs/:id` — status + result
- [ ] BullMQ worker skeleton (no arm logic yet)
- [ ] Test: enqueue → poll → completed stub

### Task 0.8: Trace shell + activity API

**Files:**
- Create: `src/observability/trace.ts`, `src/api/routes/traces.ts`, `src/api/routes/events.ts`

- [ ] `TraceCollector` — start trace, add step, finish trace
- [ ] Persist to `agent_traces`
- [ ] `GET /tenants/:id/traces`, `GET /traces/:id`
- [ ] `GET /tenants/:id/events` — filter by category, severity, campaign_id
- [ ] `GET /tenants/:id/audit`
- [ ] Unit test: trace round-trip; event emit + list

### Task 0.9: Lazy tool registry

**Files:**
- Create: `src/tools/registry.ts`, `src/harness/types.ts`

- [ ] Register all tools globally
- [ ] `getToolsForArm(armId)` returns subset per design §9
- [ ] JSON schema per tool; argument validation before execute

**Phase 0 gate:** `npm test` green; **unauthenticated request to any tenant route returns 401, and a non-member returns 403**; tenant CRUD; encrypted creds; job enqueue/poll; **events + traces written**; tool subsets differ per arm; **per-tenant rate limit trips under load; `/healthz` + `/readyz` report Postgres/Redis/queue depth**.

---

## Phase 0.5 — Harness foundations

**Goal:** Model routing, memory compaction, error taxonomy, risk assessor, ReAct loop shell.

### Task 0.5.1: Model routing

**Files:**
- Create: `src/config/model-routing.ts`, `src/llm/openrouter.ts`

- [ ] `routeModel(taskClass: 'fast' | 'balanced' | 'deep')` → env model IDs
- [ ] Chat wrapper: retry (max 2), log tokens/cost/latency + `prompt_version` to active trace
- [ ] `structuredComplete<T>(schema: ZodType<T>)` — parse or throw LLM-recoverable error
- [ ] Budget guards: `DAILY_BUDGET_USD` / `MONTHLY_BUDGET_USD` hard stop; `MAX_RUN_COST_USD` aborts run mid-loop (design §6.1); emit `budget.hard_stop`
- [ ] Prompt convention: every arm prompt module exports `PROMPT_VERSION` (semver); CI blocks prompt changes without an eval re-run

### Task 0.5.2: ReAct loop shell

**Files:**
- Create: `src/harness/react-loop.ts`, `src/harness/error-handler.ts`

- [ ] TAO loop: assemble prompt → LLM → tool calls → observe → repeat
- [ ] Hard cap: `MAX_ARM_STEPS = 10`
- [ ] Error classes: transient (retry backoff), LLM-recoverable (tool error msg), user-fixable (throw), unexpected (throw + trace)
- [ ] Unit test: loop stops at step cap; transient retry works once

### Task 0.5.3: Memory module

**Files:**
- Create: `src/memory/types.ts`, `tenant-memory.ts`, `compaction.ts`

- [ ] Short-term buffer on job record
- [ ] Working memory JSON on `jobs` table
- [ ] Long-term reads from `tenant_profiles`, `personas`, `marketing_plans`
- [ ] Episodic reads from `intel_snapshots`, `audit_log`
- [ ] Compaction: after 20 turns, summarize old with fast model, keep last 10

### Task 0.5.4: Risk assessor + permissions

**Files:**
- Create: `src/guardrails/risk-assessor.ts`, `permissions.ts`

- [ ] `assessRisk(action, params) → LOW | MEDIUM | HIGH`
- [ ] HIGH: `post_public`, `reply_comment`, `reply_message`, `publish`, `delete`
- [ ] `canExecute(tenantId, action, approvalStatus)` — harness gate before adapter
- [ ] Unit tests for risk table

### Task 0.5.5: External content sanitization

**Files:**
- Create: `src/guardrails/sanitize-external.ts`

- [ ] Strip/wrap injection patterns from web search and profile fetch results
- [ ] Delimiter: `<untrusted_content>...</untrusted_content>`
- [ ] Unit test with known injection strings

### Task 0.5.6: Campaign pipeline shell — on Mastra workflows (ADR-002)

**Files:**
- Create: `src/brain/supervisor.ts`, `campaign-pipeline.ts`, `src/crews/roster.ts`

**Scope of Mastra (selective):** workflows + HITL suspend/resume + durable state **only**. Model routing (0.5.1), the ReAct loop (0.5.2), and the risk assessor (0.5.4) stay hand-rolled. Arms stay plain TS + OpenRouter. This takes the hardest win — a suspend/resume engine we'd otherwise build — with the least lock-in to a framework shipping at high velocity (1,396 npm versions since Oct 2024).

- [ ] **Audit which Mastra features are `ee/`-gated before writing code** — the EE license forbids production use without a paid agreement. If the approval primitives are EE, fall back to hand-rolled and revisit this task
- [ ] `runCampaign(tenantId, idea?)` as a Mastra workflow: RESEARCH → STRATEGY → CREATION, **suspending** before OPS
- [ ] Approval gate = `suspend()` / `run.resume({step, resumeData: {approved}})` with `suspendSchema` / `resumeSchema`; `bail()` on reject — **this is the approval inbox, not a parallel mechanism.** The inbox UI (Task 3.5) reads suspended runs
- [ ] Mastra Postgres storage adapter — workflow state survives process restart; tenant-scoped
- [ ] Each step persists `ArmResult`; next crew reads from DB only
- [ ] `crews/roster.ts` maps arms → persona (Alex, Sam, Jordan, Riley) for traces/UI
- [ ] Supervisor never calls LLM to redo specialist output — route only
- [ ] Unit test: pipeline order enforced; no skip STRATEGY before RESEARCH; **suspend → restart process → resume completes** (proves durability)

**Phase 0.5 gate:** Model routing works; ReAct cap; risk HIGH blocks; sanitizer works; **campaign pipeline shell runs dry and survives a restart mid-suspend**.

---

## Phase 1 — RESEARCH pillar (market/SERP + trends + competitors)

**Goal:** Full research cycle with cited intel. Market/SERP, trends, and competitors run in parallel.

**Gate:** pressure-test intel against the tenant profile; completion gate (design §19).

### Task 1.1: Tool implementations

**Files:**
- Create: `src/tools/search-serp.ts`, `search-web.ts`, `fetch-web-page.ts`, `fetch-feed.ts`, `intel-provider.ts`, `query-intel-history.ts`

- [ ] `search_serp`: keywords, SERP results, People Also Ask — **Brave (Tier 0) / Tavily (Tier 1), or fixture. Not SerpAPI**: its $25/mo plan floor exceeds the entire ~$5-15 intel budget (design §12.3)
- [ ] `search_web`, `fetch_web_page` (competitor sites/blogs, robots.txt-respecting), `fetch_feed` with offline fixtures
- [ ] `fetch_feed` uses **conditional GET** (`If-None-Match` / `If-Modified-Since`); a `304` short-circuits with no parse and no LLM — this is what makes hourly polling free
- [ ] `paste_intel` intake: user-pasted competitor post text/screenshot transcriptions → sanitized intel input (v1 path for social-post signals)
- [ ] `IntelProviderAdapter` interface + stub: optional paid provider (Apify / Bright Data / official APIs) behind per-tenant credential + monthly cost cap — **no social scraping in our code** (design §12)
- [ ] All external results through `sanitize-external.ts`
- [ ] Rate limit per tenant

### Task 1.2: Market arm (SERP / market intelligence)

**Files:**
- Create: `src/arms/market/run.ts`, `prompts/market.ts`

- [ ] Input: tenant industry, product category, target geography from profile
- [ ] Output: `ArmResult` → `intel_snapshots` type=`market` (keywords, demand signals, SERP landscape, category gaps)
- [ ] Required `citations[]`
- [ ] `MODEL_BALANCED` tier

### Task 1.3: Trend arm — Tier 1 (analysis, LLM)

**Files:**
- Create: `src/arms/trends/run.ts`, `src/db/schema/intel-snapshots.ts`

- [ ] Business-relevant trends only (filter generic viral noise)
- [ ] `intel_snapshots` type=`trend` + citations
- [ ] **Triggered by the Tier-0 watch on detected change (Task 1.3b), or `force=true`, or 24h max staleness** — never on a fixed hourly clock (design §12.3)

### Task 1.3b: Trend watch — Tier 0 (hourly, no LLM) — **ADR-003**

**Files:**
- Create: `src/arms/trends/watch.ts`, `src/intel/fingerprint.ts`, `src/db/schema/intel-watermarks.ts`

**Why this exists:** running the LLM Trend arm hourly is ~720 runs/tenant-month (24× today) — it breaks §6.1's RESEARCH envelope, trips `MONTHLY_BUDGET_USD` mid-month, and produces ~20 near-identical snapshots/day, since SMB-relevant trends move daily-to-weekly, not hourly. Poll cadence and analysis cadence must be decoupled.

- [ ] BullMQ repeatable job, **hourly**, per tenant — **must not call an LLM** (assert this in test; it is the whole point)
- [ ] Conditional-GET RSS/Google Alerts feeds + one cheap Brave call
- [ ] Fingerprint candidates (SimHash 64-bit, or embedding); store watermark per source
- [ ] Gate: **Hamming ≤ 3/64** or **cosine ≥ 0.90** → near-duplicate → bump `last_seen`, **stop** (no row, no alert, no LLM)
- [ ] Below threshold → enqueue Tier-1 Trend arm (Task 1.3)
- [ ] 24h fallback: force Tier 1 even with zero detected change
- [ ] Mirror `detect_campaign_change` (§12.1) — one watch-then-analyze idiom across trends and competitors, not two
- [ ] Test: 24 consecutive unchanged polls → **zero** LLM calls, zero new snapshot rows; one changed poll → exactly one Tier-1 run

### Task 1.4: Competitor arm

**Files:**
- Create: `src/arms/competitors/run.ts`, `src/db/schema/competitors.ts`, `competitor-alerts.ts`

- [ ] Cadence, themes, hooks, gaps, recommendations + citations
- [ ] `MODEL_DEEP` tier
- [ ] Diff vs previous snapshot → `detect_campaign_change`
- [ ] On signal: insert `competitor_alerts` (competitor_id, summary, citations, status=open)
- [ ] Emit `competitor.campaign_detected`

### Task 1.4b: Competitor watch cron

**Files:**
- Create: `src/arms/competitors/watch.ts`

- [ ] BullMQ repeatable job (default every 12h) when `competitor_watch_enabled`
- [ ] Runs competitor arm in watch mode (lighter than full deep analysis)
- [ ] `GET /tenants/:id/competitor-alerts`
- [ ] `POST /tenants/:id/competitor-alerts/:id/dismiss`

### Task 1.5: Parallel research orchestrator

**Files:**
- Create: `src/brain/research-orchestrator.ts`, `src/api/routes/intel.ts`

- [ ] `runResearchCrew(tenantId)` → `Promise.all([marketArm, trendArm, competitorArm])`
- [ ] Merge into single RESEARCH `ArmResult` for Strategy crew
- [ ] `POST /tenants/:id/research/run` — full Alex crew
- [ ] `POST /tenants/:id/intel/market`, `/intel/trends`, `/intel/competitors` — individual arms
- [ ] Parent trace with child steps per arm

### Task 1.6: RESEARCH evals

**Files:**
- Create: `evals/fixtures/research/`, `src/evals/runner.ts`, `rules.ts`

- [ ] Rules: citations non-empty; market snapshot includes keywords; competitor cites sources
- [ ] `npm run evals:run -- --pillar=research` → ≥ 90%

**Phase 1 gate:** Full research run parallel; all three snapshot types; **competitor alerts fire on fixture burst**; research eval pass; grill intel against profile.

---

## Phase 2 — STRATEGY pillar (ICP, personas, angles/hooks, plan)

**Goal:** Strategy outputs feed CREATION. ICP before personas; angles before content.

**Gate:** pressure-test strategy against the tenant profile; completion gate (design §19).

### Task 2.1: Strategy arm — ICP + personas

**Files:**
- Create: `src/arms/strategy/generate.ts`, `prompts/strategy.ts`
- Create: `src/db/schema/icp-profiles.ts`, `personas.ts`, `messaging-angles.ts`, `marketing-plans.ts`

- [ ] Step A: `icp_profiles` with `audience_model: b2b | b2c` — B2B: firmographics, buying triggers, objections; B2C: demographics, psychographics, buying occasions. Prompts branch on the model (demo tenant = b2c)
- [ ] Step B: `personas` (2–4) derived from ICP
- [ ] Consumes latest RESEARCH summaries (not raw SERP dumps)
- [ ] `MODEL_DEEP` tier
- [ ] Fixtures cover both audience models (Aurora Coffee b2c + one b2b tenant)

### Task 2.2: Strategy arm — angles & hooks

**Files:**
- Create: `src/arms/strategy/angles.ts`, `prompts/angles.ts`

- [ ] `messaging_angles`: positioning angles, hooks, proof points per channel (social, email)
- [ ] Informed by competitor hooks from RESEARCH
- [ ] Versioned; linked to active `marketing_plans`

### Task 2.3: Strategy arm — marketing plan

- [ ] `marketing_plans`: 90-day skeleton, channel mix (email + social), themes, KPIs
- [ ] `ArmResult` handoff to Content arm

### Task 2.4: Strategy API + worker

- [ ] `POST /tenants/:id/strategy/generate` enqueues **Sam crew** (sequential ICP → personas → angles → plan)
- [ ] Each sub-step reads prior step from DB; no inter-agent chat
- [ ] Wire `arm=strategy` in job worker

### Task 2.4b: Counter-campaign strategy

**Files:**
- Modify: `src/arms/strategy/angles.ts`, `src/brain/campaign-pipeline.ts`
- Create: `src/db/schema/campaigns.ts`

- [ ] `campaigns` table: kind=`proactive`|`counter`, `response_to_alert_id`, status
- [ ] `POST /tenants/:id/campaign/counter` with `competitor_alert_id`
- [ ] Loads alert + competitor snapshot → generates **response angles** (differentiate, don’t copy)
- [ ] Continues into CREATION with campaign_id linked to alert
- [ ] Emit `campaign.counter_started`

### Task 2.5: STRATEGY evals

**Files:**
- Create: `evals/fixtures/strategy/demo-tenant.json`

- [ ] Rules: ICP fields present; persona count 2–4; ≥ 3 messaging angles; plan lists email + social channels
- [ ] Strategy eval ≥ 90%

**Phase 2 gate:** Demo tenant has ICP, personas, angles, plan; strategy eval pass; grill plan against profile.

---

## Phase 3 — CREATION pillar (copy + visuals + optional Nano Banana + approvals)

**Goal:** Social + email copy with visual briefs; optional image generation via Nano Banana; human approval before OPS.

**Gate:** `verify` skill (draft + image previews); completion gate (design §19).

### Task 3.1: Content arm — copywriting

**Files:**
- Create: `src/arms/content/recommend.ts`, `src/db/schema/content-drafts.ts`, `approval-queue.ts`

- [ ] Channel: `social` (per platform) and `email` (subject + body + preheader)
- [ ] Uses `messaging_angles` + latest intel summaries + plan
- [ ] If campaign is `counter`: seed prompts with competitor alert summary + “differentiate” instruction
- [ ] Link drafts to `campaign_id` (and `response_to_alert_id` when counter)
- [ ] Max 5 drafts per channel per day
- [ ] `MODEL_BALANCED` tier

### Task 3.2: Content arm — visual briefs

**Files:**
- Create: `src/arms/content/visual-brief.ts`, `src/db/schema/visual-briefs.ts`

- [ ] Per social draft: `visual_briefs` — format, mood, aspect ratio, SCALD prompt fields, brand refs
- [ ] Linked 1:1 to `content_drafts` where channel=social
- [ ] Email drafts: optional hero image brief
- [ ] Always produced (even when image gen is off — copy pack includes prompt for designer)

### Task 3.3: Image adapter (Gemini / "Nano Banana") — scaffold + toggle

**Files:**
- Create: `src/adapters/image/types.ts`, `gemini.ts`, `stub.ts`
- Create: `src/db/schema/generated-assets.ts`, `src/credentials/schemas/image-gen.ts`

**Corrected per ADR-003:** `nano_banana` and `gemini` are **not** two providers — "Nano Banana" is a marketing nickname for Gemini image models (same API, same SDK; only the model string differs). One `gemini` provider; model as config. Hence `gemini.ts`, not `nano-banana.ts`.

- [ ] **Confirm the SDK call shape against live docs before writing the interface** — current package is `@google/genai` (`@google/generative-ai` deprecated Nov 30 2025); docs are titled "Interactions API" and samples use `ai.interactions.create({model, input})` rather than `generateContent`. *Unverified — check first*
- [ ] `ImageAdapter` interface: `validateCredentials`, `healthCheck`, `generate({prompt, model, aspectRatio, resolution, brandRefUrls, variants})`
- [ ] Stub adapter returns placeholder assets when no creds
- [ ] Gemini client when `image_gen_enabled` + API key present; default model `gemini-3-pro-image`
- [ ] **Default resolution 1024×1024** — `1080x1080` is not a native tier (native: 1K/2K/4K); resample if a channel needs exactly 1080
- [ ] **Variants = N sequential calls** — there is no native multi-candidate parameter. Loop, and bill linearly
- [ ] Persist `generated_assets` (draft_id, url/path, model, prompt, variant_index, cost_usd)
- [ ] Cap variants via `image_gen_max_variants` (**default 1**); ≥2 requires explicit tenant opt-in — at Pro/1K, 3 variants = **$0.40/draft**, which at 5 drafts/day exceeds the whole modeled tenant-month (§6.1)
- [ ] Brand refs: Nano Banana 2 takes 10 object + 4 character + 3 style; Pro takes 6 object + 5 character. **Validate early that a tenant's own logo as reference image isn't policy-blocked** — the brand-consistency rule (§8.2) depends on it
- [ ] Emit `system_events` action `image.generated`; log cost on `agent_traces`
- [ ] Tenant toggle: `image_gen_enabled` (default false) + credential wizard
- [ ] Note: **SynthID watermark is applied to every image, no API opt-out** — legal read before selling generated assets

### Task 3.4: Wire image gen into Content arm

**Files:**
- Modify: `src/arms/content/recommend.ts`

- [ ] After visual brief: if `image_gen_enabled` → call ImageAdapter with brief prompt + brand refs
- [ ] Attach assets to draft before enqueueing approval
- [ ] `POST /tenants/:id/content/:draftId/regenerate-image` — regenerate without rewriting copy
- [ ] Lazy tool: expose `generate_image` to Content arm only when toggle on

### Task 3.5: Approval API + risk gate

**Files:**
- Create: `src/api/routes/approvals.ts`

- [ ] `GET /tenants/:id/approvals` — social posts, emails, images grouped
- [ ] Approve / reject / edit copy; approve / reject / regenerate image independently or together
- [ ] HIGH risk on publish/send; MEDIUM for image generate
- [ ] Audit log

### Task 3.6: Copy pack adapter

**Files:**
- Create: `src/adapters/copy-pack/generate.ts`

- [ ] Social: caption + hashtags + visual brief + attached image URLs (if any)
- [ ] Email: subject + body + preheader + hero asset if present
- [ ] If no image gen: include ready-to-paste Nano Banana prompt for manual use

### Task 3.7: CREATION evals

**Files:**
- Create: `evals/fixtures/creation/`

- [ ] Rules: on-brand voice; angle alignment; email has subject; social has platform tag
- [ ] Visual brief present for social drafts
- [ ] If fixture has `image_gen_enabled`: expect `generated_assets` count ≥ 1
- [ ] LLM-as-judge (deep tier, separate call)
- [ ] Creation eval ≥ 90%

### Task 3.8: UTM tagging + published-item anchor (MEASURE prerequisite)

**Files:**
- Create: `src/db/schema/published-items.ts`
- Modify: `src/arms/content/recommend.ts`, `src/adapters/copy-pack/generate.ts`, `src/api/routes/approvals.ts`

- [ ] Every outbound link in drafts gets `utm_campaign=campaign_id&utm_content=draft_id` (applied in copy generation, always on)
- [ ] `published_items` table: draft_id, platform, url (optional), published_at, mode (`copy_pack` | `api`; `browser` value reserved)
- [ ] `POST /tenants/:id/published-items` — **Mark as published** action from approvals/calendar (copy-pack flow has no other way to know a post went live)
- [ ] API publish and email send create `published_items` automatically (wired in Phase 8)
- [ ] Emit `item.published` event

### Task 3.9: Thin approval UI (R1 requirement — do not wait for Phase 9)

**Files:**
- Create: `web/` minimal Vite + React app — `Approvals.tsx`, `Onboard.tsx`

- [ ] Approval inbox: list pending drafts (copy + visual brief + image if any) → approve / edit / reject
- [ ] Copy pack view: ready-to-paste output per approved item + **Mark as published** button
- [ ] Simple onboarding form (`POST /tenants/:id/onboard`)
- [ ] Deliberately ugly-but-usable; full dashboard is Phase 9 — the point is validating the approve-loop UX with a real tenant **now**
- [ ] `verify` skill light pass (desktop only)

**Phase 3 gate:** recommend → (optional images) → approve → copy pack for social + email; visual briefs always; images only when toggle on; creation eval pass; **links carry UTM params; mark-as-published creates anchor row; a real user can run the whole approve loop in the thin UI**.

---

## Phase 3.5 — MEASURE pillar (metrics + analyst feedback loop)

**Goal:** Close the loop: ingest performance metrics, compute stats deterministically, and have the Analyst arm turn them into insights that feed STRATEGY, CREATION, and the daily brief. Design reference: §12.2.

**Gate:** pressure-test insights against actual metric rows; completion gate (design §19).

### Task 3.5.1: Metrics schema + import

**Files:**
- Create: `src/db/schema/post-metrics.ts`, `src/metrics/import.ts`, `src/api/routes/metrics.ts`

- [ ] `post_metrics`: published_item_id, captured_at, impressions, reach, likes, comments, shares, clicks, saves, video_views, opens, bounces, unsubscribes (nullable per channel)
- [ ] Multiple captures per item allowed (time series)
- [ ] `POST /tenants/:id/metrics/import` — manual entry (JSON) + CSV upload (Meta Business Suite / X Analytics export mapping)
- [ ] Validation: metrics must reference an existing `published_items` row
- [ ] Emit `metrics.imported`

### Task 3.5.2: Deterministic stats module (no LLM)

**Files:**
- Create: `src/metrics/stats.ts`

- [ ] Engagement rate (interactions ÷ reach), CTR, open/click rate per item
- [ ] Rolling tenant baseline per platform + noise band
- [ ] Deltas vs baseline; group by angle, format, posting time
- [ ] Min-sample check: n ≥ 5 published items per angle/format, else group flagged `insufficient_sample`
- [ ] Pure functions with unit tests — **the LLM never does this arithmetic**

### Task 3.5.3: Analyst arm (Riley)

**Files:**
- Create: `src/arms/analyst/run.ts`, `prompts/analyst.ts`, `src/db/schema/performance-insights.ts`

- [ ] Input: pre-computed stats from `src/metrics/stats.ts` only (never raw numbers to crunch, never platform HTML)
- [ ] Output: `performance_insights` — winning/losing angles, hooks, formats, timing; **every claim cites `post_metrics` row ids**
- [ ] Updates `messaging_angles.performance_score`; weak angles retired with a stated reason
- [ ] Groups below min sample → insight tagged `provisional`, excluded from downstream prompts
- [ ] `MODEL_BALANCED` tier; lazy tools: `read_metric_stats`, `read_published_items`, `read_angles`, `write_insights`, `update_angle_scores`

### Task 3.5.4: Cadence + API

**Files:**
- Modify: `src/queue/jobs.ts`; Create: `src/api/routes/insights.ts`

- [ ] BullMQ weekly repeatable job per tenant (respect `measure_enabled`) + trigger after metrics import
- [ ] `POST /tenants/:id/analyst/run` — on-demand run
- [ ] `GET /tenants/:id/insights` — latest insights; `GET /tenants/:id/performance` — metrics + KPI progress + angle scores
- [ ] Emit `insight.generated`, `angle.score_updated`

### Task 3.5.5: Feedback wiring (closing the loop)

**Files:**
- Modify: `src/arms/strategy/angles.ts`, `src/arms/content/recommend.ts`, `src/brain/daily-strategist.ts`

- [ ] Strategy prompts include top/bottom performing angles (with scores) when regenerating
- [ ] Content prompts include a "what worked" summary ≤ ~300 tokens from latest insights
- [ ] Daily strategist loads latest `performance_insights` (replaces the unsourced "performance notes")
- [ ] KPI taxonomy enforced: `marketing_plans` KPIs restricted to awareness / engagement / traffic / conversion / email classes (design §12.2)

### Task 3.5.6: MEASURE evals

**Files:**
- Create: `evals/fixtures/measure/`

- [ ] Fixture with planted winner + loser across ≥ 5 items per angle → Analyst must identify both and cite the correct `post_metrics` rows
- [ ] Fixture below sample threshold → Analyst must refuse conclusions (`provisional` only)
- [ ] Insights without citations fail
- [ ] Measure eval ≥ 90%

**Phase 3.5 gate:** import metrics → stats computed in code → Analyst insights cite rows → angle scores update → Strategy/Content prompts show performance context; planted-winner eval passes; no insight below sample threshold.

---

## Phase 4 — OPS: daily strategist (email + social)

**Goal:** Daily brief synthesizing real tenant state; brief eval.

### Task 4.1: Daily strategist

**Files:**
- Create: `src/brain/daily-strategist.ts`, `src/db/schema/daily-briefs.ts`

- [ ] Load profile, plan, intel summaries, approvals, calendar, **latest `performance_insights` (Phase 3.5)**
- [ ] Parallel intel refresh if stale > 24h
- [ ] Output: email priorities + social priorities + **open competitor alerts** + counter-campaign CTA + performance highlights (what to double down on / drop)
- [ ] Trigger content arm if queue thin
- [ ] Trigger competitor watch if stale > watch interval
- [ ] `MODEL_BALANCED` tier

### Task 4.2: Cron + API

- [ ] BullMQ repeatable job per tenant timezone
- [ ] `POST /tenants/:id/daily-brief` manual trigger

### Task 4.3: Brief eval

**Files:**
- Create: `evals/fixtures/daily-brief/`

- [ ] Rule: brief must reference platforms from tenant profile (not invented)
- [ ] Rule: no competitor names outside profile competitor list

**Phase 4 gate:** Brief references real state only; brief eval pass; trace logged.

---

## Phase 5 — OPS: scheduler (email + social calendar)

**Goal:** Calendar, reminders, checkpointed execution hooks.

### Task 5.1: Scheduler arm

**Files:**
- Create: `src/arms/scheduler/schedule.ts`, `src/db/schema/schedules.ts`

- [ ] Schedule types: `social_post`, `email_send`
- [ ] Soft schedule + reminder for both channels
- [ ] Armed execution: social → official API; email → API only (when `api_email_enabled`); browser mode deferred (ADR-001)
- [ ] States: `pending → reminded → executing → published | failed | skipped`
- [ ] Checkpoint column: `last_step` for resume
- [ ] Armed execution only when `api_publish_enabled` + creds valid + item `armed`

### Task 5.2: Calendar API

**Files:**
- Create: `src/api/routes/calendar.ts`

- [ ] `GET /tenants/:id/calendar`
- [ ] Reminder job fires at T-minus; writes audit entry

**Phase 5 gate:** Schedule approved post; reminder fires; no execution without arm + permission check.

---

## Phase 6 — OPS: social engagement (comments + DMs)

**Goal:** Reply drafts for **public comments and private messages**; HIGH-risk approval for both; no silent send.

### Task 6.1: Engagement schema + arm

**Files:**
- Create: `src/arms/engagement/draft-replies.ts`, `src/db/schema/engagement-items.ts`

- [ ] `engagement_items.type`: `comment` | `message` (DM)
- [ ] Fields: platform, thread_id, inbound_text, draft_reply, status, privacy_flag
- [ ] Input v1: manual paste of thread (comment or DM); later official API fetch
- [ ] Output: reply draft → approval queue with visible kind
- [ ] `assessRisk('reply_comment' | 'reply_message')` → always HIGH
- [ ] Voice from tenant profile / personas
- [ ] Stricter PII redaction for `type=message` in events/traces

### Task 6.2: Reply flow (comments + DMs)

- [ ] Same approve/edit/reject as posts
- [ ] Copy pack default: paste into native comment box or DM inbox
- [ ] Execute comment: `POST /publish/:approvalId/execute` when `api_reply_enabled` + armed
- [ ] Execute DM: same endpoint when `api_dm_reply_enabled` + armed
- [ ] Separate toggles so tenants can enable comments without enabling DMs

### Task 6.3: Adapter methods

**Files:**
- Modify: `src/adapters/types.ts`, API stubs for Facebook + X

- [ ] `replyToComment` and `replyToMessage` on PlatformAdapter
- [ ] Scaffold stubs fail gracefully until credentials + flag enabled

**Phase 6 gate:** Comment and DM drafts both require approval; audit logged; cannot send without execute; DM toggle independent of comment toggle.

---

## Phase 7 — DEFERRED: browser publisher (ADR-001)

**Status: deferred post-v1 — do not implement.** See design §10.0 (ADR-001).

**Why deferred:** bot detection risks **tenants'** accounts and a ban has no appeal (the strongest reason); automating web UIs violates platform ToS — LinkedIn's §8.2 explicitly bans it even on your own account; human-like cadence code is deliberate detection evasion; storing tenant session cookies is the worst breach scenario in the system; and the "API posts get penalized organic reach" premise is **refuted** by four controlled tests, not merely unproven (ADR-001). Note also that Playwright MCP — the tool usually reached for here — is stock Playwright with **zero anti-detection**, so it would achieve the opposite of the intent.

**What ships instead:** copy pack (default, zero risk) + official API adapters (Phase 8, opt-in).

**Revisit only when all three hold:** (1) measured tenant-level reach-penalty data, (2) a ToS-compliant execution path, (3) explicit tenant consent flow. Until then `browser_publish_enabled` stays a reserved flag and no `src/adapters/browser/` code is written.

**Playwright MCP remains a dev/QA tool** for the `verify` skill on the dashboard (Phase 9) — never for product runtime.

---

## Phase 8 — OPS: API adapters (social + email, toggled off)

**Goal:** Toggle-on API publish/reply; credential wizard; no rewrite to activate.

### Task 8.1: Facebook Graph API adapter

**Files:**
- Create: `src/adapters/api/facebook.ts`

- [ ] `validateCredentials`, `healthCheck`, `publishPost`, `replyToComment`, `replyToMessage`
- [ ] Stub returns clear error when flags are off

### Task 8.2: X API v2 adapter

**Files:**
- Create: `src/adapters/api/twitter.ts`

- [ ] Same interface; OAuth fields in credential schema

### Task 8.3: Email API adapter

**Files:**
- Create: `src/adapters/api/email.ts`, `src/credentials/schemas/email.ts`

- [ ] SMTP / SendGrid / Resend scaffold
- [ ] `send_email` behind `api_email_enabled` flag + credentials wizard
- [ ] HIGH risk: requires approval before send
- [ ] Email send creates `published_items` row (MEASURE anchor)
- [ ] **Compliance (design §21 — blocking before first real send):**
  - [ ] `email_suppressions` table (unsubscribes, hard bounces, complaints); Publisher **refuses** suppressed addresses (harness gate)
  - [ ] Unsubscribe link injected into every email; one-click; immediate suppression
  - [ ] List import requires `consent_confirmed` attestation; refuse without it
  - [ ] Footer template: tenant physical address + accurate From/Reply-To (collected at email-enable time)
  - [ ] SPF / DKIM / DMARC setup docs; health check warns if missing

### Task 8.3b: Email metrics webhooks (MEASURE Tier 2)

**Files:**
- Create: `src/api/routes/webhooks.ts`; Modify: `src/metrics/import.ts`

- [ ] SendGrid / Resend event webhooks → `post_metrics` (delivered, opens, clicks, bounces, unsubscribes)
- [ ] Verify webhook signatures; reject unsigned payloads
- [ ] Map events to `published_items` via message id stored at send time
- [ ] Hard bounces + spam complaints auto-append to `email_suppressions`
- [ ] Emit `metrics.imported` — first fully automated measured channel

### Task 8.4: Settings UI

**Files:**
- Create: `web/src/pages/PlatformSettings.tsx`

- [ ] Toggles: `api_publish_enabled`, `api_reply_enabled`, `api_dm_reply_enabled`, `api_email_enabled`, `image_gen_enabled` (`browser_publish_enabled` reserved/hidden — ADR-001)
- [ ] Credential form on enable; health check indicator

**Phase 8 gate:** Enable API → enter creds → health check; publish still needs approval + execute.

---

## Phase 9 — Dashboard UI + observability

**Goal:** Control plane UI; traces and cost visibility; visual QA.

### Task 9.1: Web app core

**Files:**
- Create: `web/` Vite + React

- [ ] Pages: Dashboard (5 pillars + crew activity: Alex / Sam / Jordan / Ops / Riley)
- [ ] **Activity** page: live feed from `GET /tenants/:id/events`
- [ ] **Campaign** page: run proactive + counter-campaign from alert
- [ ] **Research / Alerts** page: intel + competitor_alerts
- [ ] **Performance** page: metrics, KPI progress, insights, angle scores; manual entry + CSV import; **Mark as published** on approvals/calendar
- [ ] Approvals, Calendar, Engagement (comments + DMs), Platform Settings, Traces, Audit
- [ ] Poll `GET /jobs/:id` for long-running arm operations

### Task 9.2: Observability UI

**Files:**
- Create: `web/src/pages/Traces.tsx`, `src/observability/cost.ts`

- [ ] List traces per tenant; drill into steps
- [ ] Cost per day aggregate endpoint `GET /tenants/:id/metrics`
- [ ] Alert threshold config in env (`DAILY_BUDGET_USD`)

### Task 9.3: Visual QA

- [ ] Run the `verify` skill on Approvals + Calendar (desktop + mobile)
- [ ] Fix layout issues before phase sign-off

**Phase 9 gate:** Full UI flow demo; traces visible; `verify` skill clean.

---

## Phase 10 — Eval CI + deploy hardening

**Goal:** Full eval suite in CI; regression gate; production checklist.

### Task 10.1: Eval runner CLI

**Files:**
- Modify: `src/evals/runner.ts`

- [ ] `npm run evals:run` — all arms
- [ ] `npm run evals:run -- --pillar=research|strategy|creation` — per pillar
- [ ] Exit code 1 if pass rate < 90%
- [ ] Write `eval_runs` summary

### Task 10.2: LLM-as-judge isolation

**Files:**
- Modify: `src/evals/judge.ts`

- [ ] Judge always uses `MODEL_DEEP`; never same call as producer
- [ ] Regression: compare to previous `eval_runs` baseline

### Task 10.3: Production checklist

- [ ] Rate limiting on LLM and intel endpoints per tenant
- [ ] Canary deploy notes in `docs/deploy.md`
- [ ] Full eval suite green before tag release

**Phase 10 gate:** CI runs evals; ≥ 90% pass; regression within 5% of baseline.

---

## Tooling wiring

> **Corrected 2026-07-17.** This section previously told you to symlink `../skills/ship-loop`,
> `../skills/structural-code-review`, and `../skills/frontend-visual-qa`, and noted that
> `CLAUDE.md` references `@AGENTS.md`. **None of those files existed** — there is no
> `../skills/` directory. Each is mapped to a real tool below; the gate is unchanged.

Nothing to symlink. The completion gate (design §19) uses tools already available:

| Was | Now |
|-----|-----|
| `ship-loop` | `docs/phase-prompt.md` + `superpowers:test-driven-development` + `superpowers:verification-before-completion` |
| `structural-code-review` | `/code-review` on the diff |
| `frontend-visual-qa` | `verify` skill (Playwright MCP — QA only, ADR-001) |
| `grill-with-docs` | Inline: pressure-test the slice against `design.md` + `docs/adr/` |
| `@AGENTS.md` rules | Enforced by the gate: evidence before assertions, no self-certify |

---

## Demo tenant seed

**Files:** `seeds/demo-tenant.ts`

- Name: "Aurora Coffee Co"
- Industry: specialty coffee DTC
- Platforms: Facebook, X
- 2 named competitors
- 6+ seeded `published_items` with `post_metrics` containing a planted winning angle and a losing one (drives Analyst demo + Phase 3.5 evals)
- `npm run db:seed`

---

## Execution order

```
R1 (validation slice — one platform, copy pack only):
  Phase 0 → 0.5 → 1 RESEARCH → 2 STRATEGY → 3 CREATION (+3.8, +3.9 thin UI) → 3.5 MEASURE
  EXIT: a real tenant approves content weekly for 2+ weeks

R2 (operations):
  Phases 4–6 OPS (daily, schedule, engagement) → 9 full dashboard → 10 eval CI

R3 (automation, opt-in):
  Phase 8 official API adapters + email send + compliance + webhooks

Deferred: Phase 7 browser publisher (ADR-001)
```

**Do not start R2 before R1's exit criterion is met** (design §23 release plan).

---

## Phase summary (aligned with design v3.1)

| Phase | Pillar | Delivers | Gate |
|-------|--------|----------|------|
| **0** | foundation | Scaffold, DB, tenants, vault, traces, jobs, tool registry | Tests |
| **0.5** | foundation | Routing, ReAct, memory, risk, sanitizer | Unit tests |
| **1** | **RESEARCH** | Market/SERP + trend + competitor + campaign watch/alerts | Research eval ≥ 90% |
| **2** | **STRATEGY** | ICP, personas, angles/hooks, plan + counter-campaign | Strategy eval ≥ 90% |
| **3** | **CREATION** | Posts/campaigns + visual briefs + optional Nano Banana + approvals + UTM + `published_items` | Creation eval ≥ 90% |
| **3.5** | **MEASURE** | Metrics import, deterministic stats, Analyst insights, angle scoring, feedback wiring | Measure eval ≥ 90%; planted winner cited |
| **4** | **OPS** | Daily strategist (email + social, consumes insights) | Brief eval pass |
| **5** | **OPS** | Scheduler (email + social) | No silent execute |
| **6** | **OPS** | Comments + DM reply drafts | HIGH risk gate for both |
| ~~7~~ | ~~OPS~~ | ~~Browser publisher~~ — deferred post-v1 (ADR-001) | — |
| **8** | **OPS** | API adapters (social + email) + email compliance + metrics webhooks | Toggle + cred wizard + suppression gate |
| **9** | UI | 5-pillar dashboard + Performance page + traces | `verify` skill |
| **10** | hardening | Eval CI | Full suite ≥ 90% |

---

## Self-review checklist

- [x] Supervised Crew architecture (not chatty multi-agent)
- [x] Campaign pipeline RESEARCH → STRATEGY → CREATION → approve → OPS → MEASURE
- [x] Crew personas (Alex, Sam, Jordan, Ops, Riley) in traces/UI
- [x] Market/SERP arm explicit in Phase 1
- [x] ICP + messaging_angles in Phase 2
- [x] Visual briefs + email copy in Phase 3
- [x] Optional Nano Banana image adapter (`image_gen_enabled`, default off)
- [x] Email + social OPS in Phases 4–8
- [x] Gate per pillar (spec pressure-test, `verify` skill, completion gate — design §19)
- [x] Phase 0.5 harness foundations
- [x] `agent_traces`, `eval_runs`, async jobs
- [x] Model routing (fast / balanced / deep)
- [x] 4-type memory + compaction
- [x] Risk assessor + permission layer
- [x] Prompt injection sanitization
- [x] Eval suite per arm + CI gate
- [x] Observability UI
- [x] Lazy tools per arm
- [x] Competitor campaign watch + alerts + counter-campaign pipeline
- [x] Creating posts/campaigns via CREATION + campaign/run
- [x] MEASURE pillar: `published_items` + `post_metrics` + Analyst arm (Phase 3.5)
- [x] Deterministic stats in code; LLM interprets only; insights cite metric rows
- [x] UTM tagging on all draft links; mark-as-published anchor for copy pack
- [x] Feedback loop into Strategy angles, Content prompts, daily brief
- [x] Multi-tenant throughout
- [x] Approve before publish/reply (comments + DMs)
- [x] One shared Postgres + `tenant_id` isolation (not DB-per-customer)
- [x] API adapter scaffold + toggles (browser deferred — ADR-001)
- [x] Postgres RLS + envelope encryption from Phase 0
- [x] Release plan R1 → R2 → R3 with exit criteria
- [x] ToS-safe competitor data tiers + provider adapter decision point
- [x] Email compliance: suppression, unsubscribe, consent, SPF/DKIM/DMARC
- [x] Unit economics: cost envelope + harness-enforced budget caps
- [x] Thin approval UI in R1 (Task 3.9); B2B/B2C audience models; versioned prompts
- [x] Completion gate per phase (design §19)

---

## Coverage confirmation (all locked requirements)

Use this as the source-of-truth checklist. Every row must stay true before calling the product complete.

### Architecture & principles

| Requirement | Covered? | Where in plan |
|-------------|----------|---------------|
| Supervised Crew (not chatty multi-agent) | ✅ | Locked architecture + Phase 0.5.6 |
| Thin Brain supervisor | ✅ | `supervisor.ts`, campaign pipeline |
| Five pillars: Research → Strategy → Creation → Ops → Measure | ✅ | Execution map + Phases 1–8 + 3.5 |
| Personas Alex / Sam / Jordan / Ops | ✅ | `crews/roster.ts`, Phase 9 UI |
| Typed `ArmResult` handoffs to DB | ✅ | Global constraints + Phase 0.5 |
| Min(Input)→Max(Output) / lazy tools | ✅ | Tool registry Phase 0.9 |
| Completion gate (design §19) | ✅ | Every phase gate + Tooling wiring |
| Harness: traces, evals, memory, risk, sanitize | ✅ | Phases 0, 0.5, 10 |
| OpenRouter model routing (fast/balanced/deep) | ✅ | Phase 0.5.1 |
| Docker for local + publish | ✅ | `docker-compose.yml` (already scaffolded) |

### Multi-tenant & data

| Requirement | Covered? | Where |
|-------------|----------|-------|
| One shared Postgres for all customers | ✅ | Global constraints + design §7 |
| Isolation by `tenant_id` | ✅ | Every schema task |
| Feature toggles per tenant | ✅ | Phase 0.5 platforms + Phase 8 settings |
| Credential vault + wizard on enable | ✅ | Phase 0.4, 0.5, 8 |
| Log all actions (`system_events`) | ✅ | Phase 0.2 / 0.2b / 0.8 |
| Audit log (approvals, publish, creds) | ✅ | Phase 0.2 + emitAudit |
| LLM traces + cost | ✅ | `agent_traces` Phase 0.8, 9.2 |

### RESEARCH

| Requirement | Covered? | Where |
|-------------|----------|-------|
| Market / SERP | ✅ | Phase 1.2 |
| Trends | ✅ | Phase 1.3 |
| Competitors deep analysis | ✅ | Phase 1.4 |
| Continuous competitor watch | ✅ | Phase 1.4b |
| Alert when competitor campaigns | ✅ | `competitor_alerts` + events |
| Citations required | ✅ | Phase 1 gates / evals |

### STRATEGY

| Requirement | Covered? | Where |
|-------------|----------|-------|
| ICP | ✅ | Phase 2.1 |
| Personas | ✅ | Phase 2.1 |
| Angles / hooks | ✅ | Phase 2.2 |
| Marketing plan | ✅ | Phase 2.3 |
| Counter-campaign from competitor alert | ✅ | Phase 2.4b |

### CREATION (posts & campaigns)

| Requirement | Covered? | Where |
|-------------|----------|-------|
| Create posts (social) | ✅ | Phase 3.1 |
| Create email copy | ✅ | Phase 3.1 |
| Full campaign pipeline | ✅ | Phase 0.5.6 + campaign/run |
| Visual briefs | ✅ | Phase 3.2 |
| Nano Banana / image gen (optional toggle) | ✅ | Phase 3.3–3.4 |
| Approve / edit / reject before publish | ✅ | Phase 3.5 |
| Copy pack default (zero account risk) | ✅ | Phase 3.6 |
| Counter-campaign posts linked to alert | ✅ | Phase 3.1 |

### OPS

| Requirement | Covered? | Where |
|-------------|----------|-------|
| Daily strategist (email + social + competitor alerts) | ✅ | Phase 4 |
| Soft schedule + calendar | ✅ | Phase 5 |
| Comment reply drafts | ✅ | Phase 6 |
| Private message / DM reply drafts | ✅ | Phase 6 (`type=message`) |
| Separate toggles comments vs DMs | ✅ | `api_reply_enabled` / `api_dm_reply_enabled` |
| No silent auto-reply | ✅ | HIGH risk + approval |
| Browser publish | **Deferred post-v1 (ADR-001)** | Design §10.0; flag reserved |
| API publish / reply / email (scaffold, off by default) | ✅ | Phase 8 (R3) |
| Email compliance (suppression, unsubscribe, consent) | ✅ | Phase 8.3 + design §21 |
| Human gate on irreversible actions | ✅ | Global constraints |

### MEASURE

| Requirement | Covered? | Where |
|-------------|----------|-------|
| Published-item anchor (mark as published) | ✅ | Phase 3.8 |
| UTM tagging on all draft links | ✅ | Phase 3.8 |
| Manual / CSV metrics import | ✅ | Phase 3.5.1 |
| Deterministic stats — no LLM arithmetic | ✅ | Phase 3.5.2 |
| Analyst insights cite `post_metrics` rows | ✅ | Phase 3.5.3 + evals |
| Min-sample guardrail (`provisional` below n=5) | ✅ | Phase 3.5.2–3.5.3 |
| Angle performance scoring feeds Strategy | ✅ | Phase 3.5.5 |
| Daily brief consumes insights | ✅ | Phase 3.5.5 / 4.1 |
| Email webhook metrics (automated) | ✅ | Phase 8.3b |
| Own-page Graph API insights / GA4 | Post-v1 | Design §12.2 tiers 3–4 |

### Control plane UI

| Requirement | Covered? | Where |
|-------------|----------|-------|
| Web dashboard for you + customers | ✅ | Phase 9 + design §1.4 |
| Activate / deactivate features | ✅ | Platform Settings Phase 8/9 |
| Activity feed, traces, audit | ✅ | Phase 9 |
| Competitor alerts + counter-campaign UI | ✅ | Phase 9.1 Campaign + Research/Alerts |

### Explicitly out of scope for v1 (still intentional)

| Item | Status |
|------|--------|
| Paid ads API automation | Flag reserved only |
| Auto-approve / auto-publish | Never in v1 |
| DB-per-customer | Deferred |
| Product brand name (e.g. Fazza) | Not locked — pick when ready |
| Real-time social listening at massive scale | Batch watch only |

---

## Next step

Begin **Phase 0** implementation in `AdWasta/`.

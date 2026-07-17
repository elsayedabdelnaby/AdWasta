# AdWasta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `ship-loop` for every phase. Gate each phase: verify → simplify → independent review → structure review → runtime smoke → commit. Run eval suite where noted before phase sign-off.

**Goal:** Ship a **Supervised Crew** AdWasta: thin Brain supervisor + specialist crews (Research, Strategy, Creation, Ops, Measure), five-pillar cycle with a performance feedback loop, human-gated publish, production harness.

**Architecture (locked):** Supervisor Brain routes campaigns. **No chatty multi-agent.** Crews hand off typed `ArmResult` to DB. RESEARCH runs parallel; STRATEGY sequential; CREATION ReAct; OPS deterministic + human gates; MEASURE = deterministic stats pipeline + Analyst arm that interprets only. Ten arms, five crews, lazy tools, model routing, evals, traces.

**Tech stack:** Node 22, TypeScript, Fastify, PostgreSQL, Drizzle, BullMQ, Redis, **Playwright** (in-app publish + MCP for QA), OpenRouter (routed tiers), Vite + React dashboard.

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
| Publish default | Copy pack; **Playwright browser** / API toggled per tenant (organic prefer browser over API) |
| Browser runtime | **Playwright in-app** (Phase 7); **Playwright MCP** for Cursor QA/demos only |
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
| 0, 0.5 | (foundation) | Harness, DB, jobs, traces | ship-loop |
| **1** | **RESEARCH** | Market/SERP + trends + competitors + **campaign watch/alerts** | grill-with-docs, ship-loop |
| **2** | **STRATEGY** | ICP, personas, angles/hooks, plan + **counter-campaign angles** | grill-with-docs, ship-loop |
| **3** | **CREATION** | Posts/campaign drafts + visuals + optional Nano Banana (+ counter posts) + **UTM tagging + published_items anchor** | frontend-visual-qa, ship-loop |
| **3.5** | **MEASURE** | Metrics schema + import, deterministic stats, Analyst arm + weekly job, angle scoring, feedback wiring | grill-with-docs, ship-loop |
| **4** | **OPS** | Daily strategist (email + social, consumes `performance_insights`) | ship-loop |
| **5** | **OPS** | Scheduler (email + social calendar) | ship-loop |
| **6** | **OPS** | Comments + DM reply drafts | ship-loop |
| **7** | **OPS** | Browser publisher via **Playwright** (human-like UI) | ship-loop + Playwright MCP QA |
| **8** | **OPS** | API adapters (social + email, toggled) | ship-loop |
| **9** | (UI) | 5-pillar dashboard + Performance page + traces | frontend-visual-qa |
| **10** | (hardening) | Eval CI | ship-loop |

---

## Global Constraints

- Multi-tenant from day one: **one shared Postgres**; every table has `tenant_id` (not DB-per-customer)
- No publish or reply (comment or DM) without explicit approval in v1
- `require_approval_for_publish` and `require_approval_for_reply` are always true in v1
- Separate toggles: `api_reply_enabled` (comments) vs `api_dm_reply_enabled` (DMs)
- Default publish mode: `copy_pack`; `browser` and `api` off until tenant enables
- API adapters fully scaffolded in v1 (interface, credential schema, health check, stub) — activation is config only
- Credentials encrypted at rest; never commit secrets
- Integrate repo `skills/` via ship-loop completion gate per phase
- Organic reach priority: prefer **copy pack** or **Playwright browser publish**; no API organic publish unless tenant explicitly enables
- Browser publish = **in-app Playwright** (screenshot → act, checkpointed); **Playwright MCP** only for build/QA/demos — not the product runtime
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
- Every LLM call logs to `agent_traces` (model, tokens, cost, latency)

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
│   │   ├── browser/              # Playwright computer-use (Phase 7)
│   │   │   ├── base.ts           # screenshot → act loop + checkpoints
│   │   │   ├── playwright-pool.ts
│   │   │   ├── session-store.ts  # per-tenant encrypted storage state
│   │   │   ├── humanize.ts       # delays / typing cadence
│   │   │   ├── facebook.ts
│   │   │   └── twitter.ts
│   │   └── api/
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
│   │   └── fetch-public-profile.ts
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
- [ ] Run first migration

### Task 0.2b: Event writer helper

**Files:**
- Create: `src/observability/events.ts`

- [ ] `emitEvent(...)` → insert `system_events`
- [ ] `emitAudit(...)` → insert both `audit_log` and `system_events` (same event_id)
- [ ] Strip secrets from payload (never log API keys)
- [ ] Unit test: emit + query by tenant; audit doubles into events

### Task 0.3: Tenant API

**Files:**
- Create: `src/api/routes/tenants.ts`

- [ ] `POST /tenants`, `GET /tenants/:id`
- [ ] `POST /tenants/:id/onboard` with Zod profile validation
- [ ] Integration test: create tenant + onboard

### Task 0.4: Credential vault

**Files:**
- Create: `src/credentials/vault.ts`, `src/credentials/schemas/facebook.ts`, `twitter.ts`

- [ ] `encrypt()` / `decrypt()` AES-256-GCM with `CREDENTIALS_MASTER_KEY`
- [ ] `saveCredentials(tenantId, platform, payload)` / `getCredentials()`
- [ ] Credentials never appear in logs or traces
- [ ] Unit test round-trip

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
- [ ] Register copy-pack, browser, api stubs per platform
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

**Phase 0 gate:** `npm test` green; tenant CRUD; encrypted creds; job enqueue/poll; **events + traces written**; tool subsets differ per arm.

---

## Phase 0.5 — Harness foundations

**Goal:** Model routing, memory compaction, error taxonomy, risk assessor, ReAct loop shell.

### Task 0.5.1: Model routing

**Files:**
- Create: `src/config/model-routing.ts`, `src/llm/openrouter.ts`

- [ ] `routeModel(taskClass: 'fast' | 'balanced' | 'deep')` → env model IDs
- [ ] Chat wrapper: retry (max 2), log tokens/cost/latency to active trace
- [ ] `structuredComplete<T>(schema: ZodType<T>)` — parse or throw LLM-recoverable error

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

### Task 0.5.6: Campaign pipeline shell

**Files:**
- Create: `src/brain/supervisor.ts`, `campaign-pipeline.ts`, `src/crews/roster.ts`

- [ ] `runCampaign(tenantId, idea?)` orchestrates: RESEARCH → STRATEGY → CREATION (stops before OPS until approval)
- [ ] Each step persists `ArmResult`; next crew reads from DB only
- [ ] `crews/roster.ts` maps arms → persona (Alex, Sam, Jordan) for traces/UI
- [ ] Supervisor never calls LLM to redo specialist output — route only
- [ ] Unit test: pipeline order enforced; no skip STRATEGY before RESEARCH

**Phase 0.5 gate:** Model routing works; ReAct cap; risk HIGH blocks; sanitizer works; **campaign pipeline shell runs dry**.

---

## Phase 1 — RESEARCH pillar (market/SERP + trends + competitors)

**Goal:** Full research cycle with cited intel. Market/SERP, trends, and competitors run in parallel.

**Skills at gate:** `grill-with-docs` (intel vs tenant profile), `ship-loop`.

### Task 1.1: Tool implementations

**Files:**
- Create: `src/tools/search-serp.ts`, `search-web.ts`, `fetch-public-profile.ts`, `fetch-feed.ts`, `query-intel-history.ts`

- [ ] `search_serp`: keywords, SERP results, People Also Ask (SerpAPI/Tavily or fixture)
- [ ] `search_web`, `fetch_public_profile`, `fetch_feed` with offline fixtures
- [ ] All external results through `sanitize-external.ts`
- [ ] Rate limit per tenant

### Task 1.2: Market arm (SERP / market intelligence)

**Files:**
- Create: `src/arms/market/run.ts`, `prompts/market.ts`

- [ ] Input: tenant industry, product category, target geography from profile
- [ ] Output: `ArmResult` → `intel_snapshots` type=`market` (keywords, demand signals, SERP landscape, category gaps)
- [ ] Required `citations[]`
- [ ] `MODEL_BALANCED` tier

### Task 1.3: Trend arm

**Files:**
- Create: `src/arms/trends/run.ts`, `src/db/schema/intel-snapshots.ts`

- [ ] Business-relevant trends only (filter generic viral noise)
- [ ] `intel_snapshots` type=`trend` + citations
- [ ] Staleness skip < 24h unless `force=true`

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

**Skills at gate:** `grill-with-docs`, `ship-loop`.

### Task 2.1: Strategy arm — ICP + personas

**Files:**
- Create: `src/arms/strategy/generate.ts`, `prompts/strategy.ts`
- Create: `src/db/schema/icp-profiles.ts`, `personas.ts`, `messaging-angles.ts`, `marketing-plans.ts`

- [ ] Step A: `icp_profiles` — firmographics, pain points, buying triggers, objections
- [ ] Step B: `personas` (2–4) derived from ICP
- [ ] Consumes latest RESEARCH summaries (not raw SERP dumps)
- [ ] `MODEL_DEEP` tier

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

**Skills at gate:** `frontend-visual-qa` (draft + image previews), `ship-loop`.

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

### Task 3.3: Image adapter (Nano Banana) — scaffold + toggle

**Files:**
- Create: `src/adapters/image/types.ts`, `nano-banana.ts`, `stub.ts`
- Create: `src/db/schema/generated-assets.ts`, `src/credentials/schemas/image-gen.ts`

- [ ] `ImageAdapter` interface: `validateCredentials`, `healthCheck`, `generate`
- [ ] Stub adapter returns placeholder assets when no creds
- [ ] `nano_banana` / Gemini client when `image_gen_enabled` + API key present
- [ ] Persist `generated_assets` (draft_id, url/path, model, prompt, variant_index, cost_usd)
- [ ] Cap variants via `image_gen_max_variants` (default 3)
- [ ] Emit `system_events` action `image.generated`; log cost on `agent_traces`
- [ ] Tenant toggle: `image_gen_enabled` (default false) + credential wizard

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
- [ ] `published_items` table: draft_id, platform, url (optional), published_at, mode (`copy_pack` | `browser` | `api`)
- [ ] `POST /tenants/:id/published-items` — **Mark as published** action from approvals/calendar (copy-pack flow has no other way to know a post went live)
- [ ] Browser/API publish and email send create `published_items` automatically (wired in Phases 7–8)
- [ ] Emit `item.published` event

**Phase 3 gate:** recommend → (optional images) → approve → copy pack for social + email; visual briefs always; images only when toggle on; creation eval pass; **links carry UTM params; mark-as-published creates anchor row**.

---

## Phase 3.5 — MEASURE pillar (metrics + analyst feedback loop)

**Goal:** Close the loop: ingest performance metrics, compute stats deterministically, and have the Analyst arm turn them into insights that feed STRATEGY, CREATION, and the daily brief. Design reference: §12.2.

**Skills at gate:** `grill-with-docs` (insights vs actual metric rows), `ship-loop`.

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
- [ ] Armed execution: social → browser/API; email → API only (when `api_email_enabled`)
- [ ] States: `pending → reminded → executing → published | failed | skipped`
- [ ] Checkpoint column: `last_step` for resume
- [ ] Armed execution only when `browser_publish_enabled` or `api_publish_enabled` + item `armed`

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
- [ ] Input v1: manual paste of thread (comment or DM); later browser/API fetch
- [ ] Output: reply draft → approval queue with visible kind
- [ ] `assessRisk('reply_comment' | 'reply_message')` → always HIGH
- [ ] Voice from tenant profile / personas
- [ ] Stricter PII redaction for `type=message` in events/traces

### Task 6.2: Reply flow (comments + DMs)

- [ ] Same approve/edit/reject as posts
- [ ] Copy pack default: paste into native comment box or DM inbox
- [ ] Execute comment: `POST /publish/:approvalId/execute` when `api_reply_enabled` or browser armed
- [ ] Execute DM: same endpoint when `api_dm_reply_enabled` or browser armed
- [ ] Separate toggles so tenants can enable comments without enabling DMs

### Task 6.3: Adapter methods

**Files:**
- Modify: `src/adapters/types.ts`, API/browser stubs for Facebook + X

- [ ] `replyToComment` and `replyToMessage` on PlatformAdapter
- [ ] Scaffold stubs fail gracefully until credentials + flag enabled

**Phase 6 gate:** Comment and DM drafts both require approval; audit logged; cannot send without execute; DM toggle independent of comment toggle.

---

## Phase 7 — OPS: Playwright browser publisher (human-like social)

**Goal:** Optional armed publish via **in-app Playwright** in the real website UI (organic reach; no social API). Checkpointed computer-use loop. Use **Playwright MCP** during this phase for selector QA and demos only.

**Why Playwright (not API):** Post like a human in Facebook/X/etc. so organic reach is not API-penalized. Aligns with Veeza computer-use: screenshot → reason → act; gate irreversible clicks; checkpoint long flows.

### Task 7.0: Playwright dependency + Docker browsers

**Files:**
- Update: `package.json`, `Dockerfile`, `docs/browser-session-setup.md`, `.env.example`

- [ ] Add `playwright` dependency; `npx playwright install` (chromium) in Docker image / CI
- [ ] Env: `PLAYWRIGHT_HEADLESS=true`, `BROWSER_SESSION_DIR` (or DB-backed encrypted storage state)
- [ ] Document: Playwright MCP (Cursor) for local flow verification — **never** load production tenant sessions into MCP
- [ ] Worker container has enough shared memory for Chromium (`shm_size` in compose if needed)

### Task 7.1: Browser adapter base (computer-use loop)

**Files:**
- Create: `src/adapters/browser/base.ts`, `playwright-pool.ts`, `session-store.ts`, `humanize.ts`

- [ ] Screenshot → reason → act loop; **checkpoint after each UI step** (`last_step`, storage path)
- [ ] Gate: `browser_publish_enabled` + approval + item `armed` + `permissions.canExecute`
- [ ] Transient retry max 2; resume from `last_step` (do not restart 40-step flows from step 1)
- [ ] Human-like delays / typing cadence (`humanize.ts`) — avoid instant paste bursts
- [ ] Stop before irreversible Post/Share; confirm step logged to `agent_traces`
- [ ] Per-tenant + platform **isolated** Playwright context (encrypted storage state)
- [ ] Captcha / unexpected modal → user-fixable interrupt (not silent fail)

### Task 7.2: Facebook browser publish

**Files:**
- Create: `src/adapters/browser/facebook.ts`, `docs/browser-session-setup.md`

- [ ] Session setup wizard notes (human logs in once; agent stores storage state)
- [ ] `publishPost` UI flow on **test page / staging** first
- [ ] Validate selectors with **Playwright MCP** in Cursor before locking in code
- [ ] Copy pack fallback if browser session expired

### Task 7.3: X (Twitter) browser publish (scaffold)

**Files:**
- Create: `src/adapters/browser/twitter.ts`

- [ ] Same interface as Facebook; scaffold + stub health check
- [ ] Demo path optional if Facebook gate passes first

### Task 7.4: Execute API + scheduler hook

- [ ] `POST /publish/:approvalId/execute?mode=browser`
- [ ] Scheduler path: armed + due → enqueue browser publish job (BullMQ)
- [ ] Full `audit_log` + `system_events` + `agent_traces` on success/failure
- [ ] Never silent: failures always surface in approval/calendar UI

### Task 7.5: Phase gate with Playwright MCP

- [ ] MCP smoke: open test page → walk publish selectors → confirm screenshots match adapter expectations
- [ ] Product smoke: demo tenant arms a post → worker publishes via in-app Playwright
- [ ] Simulated mid-flow crash → resume from checkpoint

**Phase 7 gate:** Demo publish to test page via **in-app Playwright**; never silent; checkpoint resume works; MCP used only for QA notes, not as runtime.

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

### Task 8.3b: Email metrics webhooks (MEASURE Tier 2)

**Files:**
- Create: `src/api/routes/webhooks.ts`; Modify: `src/metrics/import.ts`

- [ ] SendGrid / Resend event webhooks → `post_metrics` (delivered, opens, clicks, bounces, unsubscribes)
- [ ] Verify webhook signatures; reject unsigned payloads
- [ ] Map events to `published_items` via message id stored at send time
- [ ] Emit `metrics.imported` — first fully automated measured channel

### Task 8.4: Settings UI

**Files:**
- Create: `web/src/pages/PlatformSettings.tsx`

- [ ] Toggles: `api_publish_enabled`, `api_reply_enabled`, `api_dm_reply_enabled`, `api_email_enabled`, `browser_publish_enabled`, `image_gen_enabled`
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

- [ ] Run `frontend-visual-qa` skill on Approvals + Calendar (desktop + mobile)
- [ ] Fix layout issues before phase sign-off

**Phase 9 gate:** Full UI flow demo; traces visible; frontend-visual-qa clean.

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

## Skills wiring

Symlink or copy into `marketing-agent/.claude/skills/`:

- `../skills/ship-loop`
- `../skills/structural-code-review`
- `../skills/frontend-visual-qa`

`CLAUDE.md` already references `@AGENTS.md` and ship-loop.

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
Phase 0 → 0.5
       → 1 RESEARCH → 2 STRATEGY → 3 CREATION → 3.5 MEASURE
       → 4–6 OPS (daily, schedule, engagement)
       → 9 UI (parallel after Phase 3)
       → 7–8 OPS publish adapters + email webhooks (parallel after Phase 3)
       → 10 eval CI
```

**MVP demo:** Phases 0 → 0.5 → 1 → 2 → 3 → 3.5 → 4 → 5 → 6 → 9 → 10 (full five-pillar cycle with feedback loop).

**Activation-ready:** Phases 7–8 (social browser + social/email API toggles).

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
| **7** | **OPS** | Playwright browser publisher (human-like) | Checkpointed UI publish + MCP QA |
| **8** | **OPS** | API adapters (social + email) + email metrics webhooks | Toggle + cred wizard |
| **9** | UI | 5-pillar dashboard + Performance page + traces | frontend-visual-qa |
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
- [x] Skills per pillar (grill-with-docs, frontend-visual-qa, ship-loop)
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
- [x] API/browser scaffold + toggles
- [x] ship-loop gate per phase

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
| ship-loop + skills gates | ✅ | Every phase gate + Skills wiring |
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
| Copy pack (no API for organic by default) | ✅ | Phase 3.6 |
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
| Browser publish (optional, **Playwright** human-like UI) | ✅ | Phase 7 (+ Playwright MCP for QA) |
| API publish / reply / email (scaffold, off by default) | ✅ | Phase 8 |
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

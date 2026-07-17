# AdWasta — Design Spec

**Status:** v3.1 — **Supervised Crew + MEASURE pillar**  
**Date:** 2026-07-17 (v3: 2026-07-16)  
**Codename:** Supervised Crew — One Brain, Specialist Team

**Informed by:** [Agent Harness anatomy](https://blog.dailydoseofds.com/p/the-anatomy-of-an-agent-harness), [Agentic AI Engineer roadmap](https://youmind.com/landing/x-viral-articles/agentic-ai-engineer-roadmap-guide), [Min(Input)→Max(Output)](https://ahmedhesham.dev/blog/min-input-max-output/), Veeza computer-use production lessons.

**Architecture decision (locked):** Multi-agent **supervised crew** with structured handoffs — **not** a single mega-prompt, **not** chatty agents debating in one thread.

---

## 1. Problem & goal

Build a **multi-tenant AdWasta** that runs the full marketing cycle for any business workspace:

- Strategy: personas, positioning, marketing plan, messaging
- Intelligence: trend radar + competitor deep analysis
- Content: post recommendations with **approve / edit / reject**
- Operations: daily cross-platform strategy, scheduling, comment **and private message (DM)** reply drafts
- Execution: **human-gated** publish paths with zero account risk (copy pack default; official APIs opt-in)
- Measurement: post/email metrics + performance insights that feed back into strategy and content (the agent learns per tenant)

**Success looks like:** A user creates a tenant (brand workspace), onboards their business once, and gets daily actionable marketing output — with every external action gated behind explicit approval and a chosen publish mode.

**Design principle:** The LLM is the CPU. The **harness is the product**. Two deployments using the same model can differ wildly based on orchestration, context selection, verification, and guardrails alone.

---

## 1.1 Marketing cycle — five pillars

The product follows one end-to-end marketing cycle. Every arm and phase maps to a pillar. The Brain orchestrates the cycle; the **completion gate** (§19) gates each pillar before the next tranche of work ships. MEASURE closes the loop: performance feeds the next STRATEGY / CREATION round.

```
THE AdWasta
├───────────────┬─────────────────┬──────────────┬────────────┬──────────────┐
│ 1. RESEARCH   │ 2. STRATEGY     │ 3. CREATION  │ 4. OPS     │ 5. MEASURE   │
│ Market / SERP │ ICP / Personas  │ Copywriting  │ Email      │ Metrics      │
│ Competitors   │ Angles / Hooks  │ Visuals      │ Social     │ Insights     │
└───────────────┴─────────────────┴──────────────┴────────────┴──────────────┘
        ▲                                                            │
        └──────────── performance_insights feed back ────────────────┘
```

### Pillar → capability map

| Pillar | Capabilities | Arms / modules | Primary outputs |
|--------|--------------|----------------|-----------------|
| **1. RESEARCH** | Market & SERP intelligence | **Market** arm (SERP, keywords, demand signals) + **Trend** arm | `intel_snapshots` type=market, type=trend |
| | Competitor intelligence | **Competitor** arm | `intel_snapshots` type=competitor |
| | Competitor campaign watch | **Competitor watch** (scheduled) | `competitor_alerts` when a rival launches a campaign |
| | Counter-campaign assist | Brain → STRATEGY + CREATION | Response campaign drafts from alert |
| **2. STRATEGY** | ICP & personas | **Strategy** arm | `icp_profiles`, `personas` |
| | Angles & hooks | **Strategy** arm (messaging layer) | `messaging_angles` |
| | Channel plan | **Strategy** arm | `marketing_plans` |
| **3. CREATION** | Copywriting | **Content** arm (Jordan) | `content_drafts` channel=social \| email |
| | Visual briefs | **Content** arm | `visual_briefs` (prompt + size + mood) linked to drafts |
| | Image generation | **Image adapter** (Nano Banana / Gemini) — optional | `generated_assets` attached to drafts |
| **4. OPS** | Email operations | **Scheduler** + **Publisher** (email adapters) | schedules, copy packs, optional send |
| | Social operations | **Scheduler** + **Engagement** + **Publisher** | posts, **comment + DM replies**, calendar |
| | Daily coordination | **Daily strategist** | `daily_briefs` (email + social priorities) |
| **5. MEASURE** | Metrics ingestion | **Metrics pipeline** (deterministic, code — not LLM) | `published_items`, `post_metrics` |
| | Performance insights | **Analyst** arm (Riley) | `performance_insights`, angle performance scores |

### Cycle execution order (per tenant)

```
ONBOARD → RESEARCH (market + trend + competitor, parallel)
       → STRATEGY (ICP → personas → angles/hooks → plan)
       → CREATION (copy + visual briefs [+ optional Nano Banana images] → approval inbox)
       → OPS (daily brief → schedule → engage → publish when approved)
       → MEASURE (mark published → ingest metrics → weekly Analyst insights)
              ↳ insights feed the next STRATEGY / CREATION round + daily brief
```

Re-run **RESEARCH** on a schedule (24h staleness) or on demand. **CREATION** consumes latest RESEARCH + STRATEGY only — never stale angles or intel. **MEASURE** runs weekly per tenant plus on-demand after a metrics import (see §12.2).

### Skills per pillar (repo `skills/`)

| Pillar | Skills applied |
|--------|----------------|
| RESEARCH | Pressure-test intel against tenant profile; completion gate (§19) |
| STRATEGY | Pressure-test strategy against tenant profile; completion gate (§19) |
| CREATION | `verify` skill (draft + image previews); completion gate (§19) |
| OPS | `verify` skill (inbox + calendar); completion gate (§19); human approval gate |
| MEASURE | Pressure-test insights against actual metric rows; completion gate (§19) |

---

## 1.2 Supervised Crew — final architecture

Marketing needs specialists. Industry best practice is a **small team of virtual experts** — but production systems use a **supervisor + typed handoffs**, not agents free-chatting in one context window.

### Why not a single agent?

One prompt doing research + ICP + copy + scheduling produces generic, shallow output. Context rots; tools collide; quality drops.

### Why not a chatty multi-agent crew?

Agents “talking to each other” in a shared thread causes coordination overhead, silent bad handoffs, token explosion (~15×), and review loops. **Rejected for v1.**

### What we build instead: Supervised Crew

```
                  ┌────────────────────────┐
                  │   Human campaign idea  │
                  └───────────┬────────────┘
                              ▼
                  ┌────────────────────────┐
                  │   BRAIN (Supervisor)   │
                  │   routes · never redo  │
                  │   specialist work      │
                  └───────────┬────────────┘
                              ▼
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ CREW: RESEARCH│   │ CREW: STRATEGY│   │ (parallel     │
│ Market        │   │ ICP           │   │  research     │
│ Trend         │   │ Personas      │   │  only)        │
│ Competitor    │   │ Angles/Hooks  │   └───────────────┘
└───────┬───────┘   │ Plan          │
        │           └───────┬───────┘
        │    ArmResult      │ ArmResult
        └──────────┬────────┘
                   ▼
        ┌──────────────────────┐
        │ CREW: CREATION         │
        │ Copy (social + email)  │
        │ Visual briefs          │
        └───────────┬────────────┘
                    ▼
        ┌──────────────────────┐
        │ HUMAN APPROVAL GATE  │  ← non-negotiable
        └───────────┬──────────┘
                    ▼
        ┌──────────────────────┐
        │ CREW: OPS            │
        │ Daily · Schedule     │
        │ Engage · Publish     │
        └───────────┬──────────┘
                    ▼
        ┌──────────────────────┐
        │ CREW: MEASURE        │
        │ Metrics · Insights   │──▶ feeds back into STRATEGY / CREATION
        └──────────────────────┘
```

### Specialist roster (UI-facing personas)

Same harness underneath; friendly names in the dashboard:

| Persona | Role | Arms | Pillar |
|---------|------|------|--------|
| **Alex** | Lead Market Researcher | Market, Trend, Competitor | RESEARCH |
| **Sam** | Persona & Strategy Lead | Strategy (ICP → personas → angles → plan) | STRATEGY |
| **Jordan** | Expert Copywriter + visual director | Content (copy + visual briefs) → optional Image adapter | CREATION |
| **Ops** | Campaign operator | Daily strategist, Scheduler, Engagement, Publisher | OPS |
| **Riley** | Performance Analyst | Analyst (interprets deterministic stats; scores angles) | MEASURE |

The Brain is not a persona — it is the **supervisor runtime** (orchestrator + permissions + traces).

### Handoff contract (best practice)

Specialists never pass chat logs. They pass **`ArmResult`**:

- `summary` — max ~2k tokens for supervisor/next crew
- `data` — typed, persisted to DB (source of truth)
- `citations` — required for RESEARCH crew
- `confidence` — optional; low confidence → flag for human

**Rule:** CREATION crew reads `messaging_angles` + intel summaries from DB — never raw SERP HTML.

### Orchestration pattern per crew

| Crew | Pattern | Why |
|------|---------|-----|
| RESEARCH | **Parallel** plan-and-execute (3 arms at once) | Independent domains; faster |
| STRATEGY | **Sequential** plan-and-execute (ICP → personas → angles → plan) | Each step depends on prior |
| CREATION | **Single** ReAct loop (copy → visual brief → optional image gen) | Tight coupling within one deliverable |
| OPS | **Deterministic** workflow + human gates | Irreversible actions need control |
| MEASURE | **Deterministic** stats pipeline + single Analyst pass | Stats computed in code; LLM interprets only — never does arithmetic |

---

## 1.3 Locked best-practice decisions

These are final — do not revisit without strong evidence.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent topology | Supervised crew + thin Brain | Specialization without chatty multi-agent failure modes |
| Handoffs | Typed `ArmResult` to DB | Verifiable, resumable, eval-friendly |
| Loop style | Plan-and-execute between crews; ReAct inside an arm | 3.6× faster than pure ReAct chains (LLMCompiler); flexible within arm |
| Context | Min sufficient per arm; lazy tools | [Context engineering](https://blog.dailydoseofds.com/p/the-anatomy-of-an-agent-harness) — quality over volume |
| Model routing | Fast / balanced / deep per task | Cost + quality balance |
| Verification | Rules + eval suite + completion gate (§19); judge ≠ producer | Deterministic beats self-grading |
| Publish | Copy pack default; official API toggled per tenant; **browser publish deferred post-v1 (ADR-001)** | Zero account risk; ToS-safe; the "API posts get penalized reach" premise is **refuted** by controlled tests (ADR-001) — not merely unproven |
| Image gen | Nano Banana optional; Jordan writes prompt | Pixels ≠ copy; toggle off by default |
| Permissions | Harness enforces; model only proposes | Anthropic separation pattern |
| Multi-tenancy | Day one | Product requirement |
| UI | 5-pillar + crew personas + **tenant feature toggles** | Matches mental model |
| Measurement | Deterministic metrics pipeline + LLM Analyst (interprets only) | Model never does arithmetic; insights cite metric rows |
| Metrics ingestion | Manual/CSV first; email webhooks Phase 8; own-page Graph API post-v1 | Universal v1; automate only ToS-safe sources |
| UTM tagging | Always on for every link in drafts | Free now; enables conversion attribution later |
| Browser publish | **Deferred post-v1** (ADR-001, §10.0) | ToS violation + customer account risk + unverified reach premise |
| Competitor data | ToS-safe tiers: SERP/web/RSS + pasted intel; paid provider adapter optional (§12) | Social scraping is blocked + illegal-ish; price the provider before R2 |
| Tenant isolation | Middleware `tenant_id` **+ Postgres RLS from day one** | Defense-in-depth; cheap now, painful to retrofit |
| **Authentication** | **WorkOS AuthKit (ADR-002); `tenant_id` resolves from session, never a path param** | RLS is authorization, not identity — without auth it's a lock with no door |
| Workflow engine | Mastra (Apache-2.0) for **workflows + HITL suspend/resume + durable state only**; arms stay plain TS + OpenRouter (ADR-002) | `suspend()`/`resume()` *is* the approval inbox — the hardest part of the harness, already built |
| Observability | Langfuse (MIT core) for tracing/evals; **§6.1 caps stay harness-enforced** | Langfuse has no per-tenant spend cap — enforcement can't live there |
| Credential crypto | Envelope encryption (KEK → per-tenant DEK), KMS-ready | Rotation without re-encrypting every row |
| Release scoping | R1 validation slice → R2 operations → R3 automation (§23) | Prove value before building the rest |
| Eval gates | Deterministic rules blocking day one; judge scores ratchet in (§17) | Honest gates; fixtures harvested from real approvals |
| Email sending | Only with suppression list + unsubscribe + consent attestation (§21) | CAN-SPAM / GDPR compliance before first send |
| Prompts | Versioned (`PROMPT_VERSION` in traces); change ⇒ eval re-run | Prompts are the core product asset |

---

## 1.4 Control Plane UI (web dashboard)

**Yes — a full frontend is planned (Phase 9).** This is how you and your customers control the agent without touching code or env files.

### Who uses it

| User | What they control |
|------|-----------------|
| **You (platform admin)** | Deploy config, default feature flags, billing/limits |
| **Customer (tenant admin)** | Their brand workspace: enable/disable features, credentials, approvals |

Multi-tenant from day one: every toggle and credential is scoped to `tenant_id`.

### Pages (v1)

| Page | Purpose |
|------|---------|
| **Dashboard** | 5-pillar overview + crew activity (Alex / Sam / Jordan / Ops / Riley) |
| **Activity** | Full event stream (`system_events`) — filters by category / severity |
| **Research** | Intel snapshots + **competitor alerts** |
| **Campaign** | Start campaign / **counter-campaign from alert**; pipeline status |
| **Strategy** | ICP, personas, angles, plan (edit + re-run) |
| **Creation** | Draft queue — approve / edit / reject |
| **Calendar** | Email + social schedule + **Mark as published** action |
| **Performance** | Post/email metrics, KPI progress, `performance_insights`, angle scores; manual metrics entry + CSV import |
| **Engagement** | Comment + **DM / inbox message** reply drafts |
| **Platform settings** | Per-platform feature toggles + credentials |
| **Traces** | Cost, latency, errors per run (`agent_traces`) |
| **Audit** | Compliance view (`audit_log`) |

### Feature toggles (per tenant, per platform)

Customers activate only what they need. Turning a feature **on** opens a credential wizard if required.

| Toggle | Default | When enabled |
|--------|---------|--------------|
| `competitor_watch_enabled` | On | Poll competitors for new campaign signals |
| `competitor_alert_notify` | On | Notify when a rival campaign is detected |
| `strategy_enabled` | On | Sam crew runs |
| `creation_enabled` | On | Jordan crew runs (copy + visual briefs) |
| `image_gen_enabled` | Off | Nano Banana / Gemini generates images from visual briefs |
| `daily_brief_enabled` | On | Ops daily brief cron |
| `scheduler_enabled` | On | Calendar + reminders |
| `engagement_enabled` | On | Comment + DM reply draft generation |
| `measure_enabled` | On | Metrics ingestion + weekly Analyst run + angle scoring |
| `browser_publish_enabled` | Off (**reserved — post-v1, ADR-001**) | Flag reserved; no v1 implementation |
| `api_publish_enabled` | Off | Social API publish (official APIs) + credential form |
| `api_reply_enabled` | Off | API replies on **public comments** |
| `api_dm_reply_enabled` | Off | API replies on **private messages / DMs** |
| `api_email_enabled` | Off | Email send via SMTP/SendGrid/Resend |

`publish_mode` preference: `copy_pack` | `browser` | `api` (default `copy_pack`).

**Rules:** Enabling publish/reply/email never bypasses the **approval inbox**. HIGH-risk actions always need human OK.

### Docker + UI

- **Dev:** `docker compose up` → web on **http://localhost:8080**, API on **http://localhost:3001**
- **Prod:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` → web on port 80; DB/Redis internal only
- Nginx proxies `/api/*` to the API container

Placeholder UI ships now; full React dashboard in Phase 9.

---

## 2. Architecture options (decision record)

### Option A — Single monolith agent ❌ Rejected

One LLM loop with all tools. Fast to demo; fails on quality and context at scale.

### Option B — Supervised Crew + thin Brain ✅ **Selected**

Specialist **crews** (arms) with structured handoffs; Brain supervises routing only. Maps to production harness, five pillars, and industry multi-agent best practice without chatty coordination.

### Option C — Event-driven microservices ❌ Deferred

Scale later if needed; overkill for v1.

### Option D — Chatty multi-agent crew ❌ Rejected

CrewAI-style open collaboration. High token cost, handoff failures, demo-only reliability.

**Final stack:** Option B — Supervised Crew implemented as Brain + ten arms + harness (traces, evals, guardrails, memory).

---

## 3. Agent harness mapping

The harness is everything around the model: orchestration, tools, memory, context, state, errors, guardrails, verification, and observability. This table is the build checklist.

| Harness component | AdWasta implementation |
|-------------------|------------------------------|
| **1. Orchestration loop** | Brain runs TAO (thought-action-observation) per arm; dumb loop, smart model |
| **2. Tools** | Lazy-loaded per arm; schema-validated; sandboxed execution |
| **3. Memory** | Four memory types per tenant (see §5) |
| **4. Context management** | Minimum sufficient context per step; arm-scoped prompts; compaction when buffer grows |
| **5. Prompt construction** | Priority stack: system → arm skill → tenant profile → working state → user trigger. **Prompts are versioned assets:** each arm prompt module exports `PROMPT_VERSION`; every trace step logs it; changing a prompt requires an eval re-run (CI); rollback = revert the version |
| **6. Output parsing** | Native tool calls + Zod-validated structured outputs; never trust raw strings |
| **7. State management** | DB persistence + checkpoints on schedules and browser publish flows |
| **8. Error handling** | Four error classes with defined recovery (see §14) |
| **9. Guardrails** | Risk assessor + approval inbox + tool permission layer separate from model |
| **10. Verification loops** | Eval suite + completion gate (§19); deterministic checks over self-grading |
| **11. Subagent orchestration** | Ten specialist arms in five crews; 1–2k token `ArmResult` handoffs |

**Harness thickness:** Keep the Brain thin. Arms own domain reasoning. Verification and permissions live in the harness, not in prompt hope.

---

## 4. System overview

```mermaid
flowchart TB
  subgraph UI["Control plane"]
    Dashboard[Dashboard / CLI]
    Inbox[Approval inbox]
    Cal[Content calendar]
    Settings[Tenant settings + credentials]
    Obs[Traces + cost dashboard]
  end

  subgraph Harness["Agent harness"]
    Brain[Brain — supervisor]
    Router[Campaign router]
    Risk[Risk assessor]
    Tools[Lazy tool registry]
    Ctx[Context selector]
    Eval[Eval runner]
    Trace[Trace collector]
  end

  subgraph ResearchCrew["CREW: RESEARCH"]
    M[Market]
    T[Trend]
    Co[Competitor]
  end

  subgraph StrategyCrew["CREW: STRATEGY"]
    St[ICP · Personas · Angles · Plan]
  end

  subgraph CreationCrew["CREW: CREATION"]
    Ct[Copy · Visuals]
  end

  subgraph OpsCrew["CREW: OPS"]
    D[Daily strategist]
    Sch[Scheduler]
    E[Engagement]
    Pub[Publisher]
  end

  subgraph MeasureCrew["CREW: MEASURE"]
    MP[Metrics pipeline — deterministic]
    An[Analyst — Riley]
  end

  subgraph Exec["Execution adapters"]
    CP[Copy pack]
    BR[Browser]
    API[API — toggled]
  end

  subgraph Data["Tenant data"]
    DB[(PostgreSQL)]
    Vault[(Encrypted credentials)]
    Mem[4-type memory]
    Skills[Skills / procedures]
  end

  Dashboard --> Brain
  Inbox --> Risk
  Brain --> Router
  Router --> ResearchCrew
  ResearchCrew -->|ArmResult| StrategyCrew
  StrategyCrew -->|ArmResult| CreationCrew
  CreationCrew --> Inbox
  Inbox -->|approved| OpsCrew
  ResearchCrew & StrategyCrew & CreationCrew & OpsCrew --> Tools
  Brain --> Ctx
  Ctx --> Mem
  ResearchCrew & StrategyCrew & CreationCrew & OpsCrew & MeasureCrew --> DB
  OpsCrew --> Exec
  Exec --> Vault
  Exec -->|published_items| MP
  MP -->|computed stats| An
  An -->|performance_insights| StrategyCrew & CreationCrew & D
  ResearchCrew & StrategyCrew & CreationCrew & OpsCrew & MeasureCrew --> Trace
  Trace --> Obs
  Eval --> ResearchCrew & StrategyCrew & CreationCrew & MeasureCrew
  Skills --> Brain
```

---

## 5. Memory architecture

An agent with no memory repeats itself. Memory is not one table — it is four timescales, all scoped by `tenant_id`.

| Type | Scope | Storage | Used for |
|------|-------|---------|----------|
| **Short-term** | Current arm run | In-memory conversation buffer | Tool loop within one job |
| **Working** | Current job / daily cycle | `working_memory` JSON on job record | Today's brief context, partial intel |
| **Long-term** | Cross-session | `tenant_profiles`, `personas`, `marketing_plans`, preferences | Voice, goals, stable decisions |
| **Episodic** | Historical runs | `intel_snapshots`, `audit_log`, `agent_traces` | What happened before; week-over-week intel |

### Compaction rules

- When short-term buffer exceeds ~20 turns, summarize older turns with a **cheap model**, keep last 10 verbatim.
- Preserve: architectural decisions, unresolved constraints, approval decisions, brand voice rules.
- Discard: redundant raw tool outputs (observation masking).
- Never compact away: active approval state, scheduled item checkpoints, credential flags.

### Retrieval principle

Make maximum context **reachable**, deliver **minimum sufficient** context per arm call. Strategy arm does not load browser publish tools. Publisher arm does not load competitor research transcripts.

---

## 6. Model routing

Not every step needs the most expensive model. Route by task complexity to control cost and latency.

| Task class | Examples | Default tier | Rationale |
|------------|----------|--------------|-----------|
| **Fast** | Classify intent, extract fields, summarize intel, compact memory | `claude-haiku` / `gpt-4o-mini` | High volume, low reasoning depth |
| **Balanced** | Draft posts, reply drafts, daily brief, trend summaries | `claude-sonnet` / `gpt-4o` | Quality + speed balance |
| **Deep** | Strategy plan, competitor deep analysis, eval judge | `claude-opus` / best available | High-stakes reasoning |

Configuration via `MODEL_ROUTING` env or per-tenant override in settings. Every LLM call logs model ID, tokens, cost, and latency to `agent_traces`.

**Rule:** Track cost per tenant per day from day one. Alert when a tenant exceeds budget threshold.

---

## 6.1 Unit economics — cost envelope per tenant

**Rule (locked):** the product is not "done" until modeled cost per tenant-month is known and price ≥ 3× that cost. Estimates below are placeholders — **Phase 1 gate records actuals from traces and updates this table.**

| Run | Frequency (defaults) | Est. cost/run | Est. cost/mo |
|-----|----------------------|---------------|--------------|
| **Trend/competitor watch — Tier 0** (§12.3) | **hourly ≈ 720/mo** | **~$0 (no LLM)** | **~$0** |
| RESEARCH crew (3 arms, balanced+deep) — Tier 1 | on detected change; 24h max staleness ≈ 30–40/mo | ~$0.20 | ~$6–8 |
| Competitor watch (light mode) | every 12h ≈ 60/mo | ~$0.05 | ~$3.00 |
| STRATEGY crew (deep) | ~2/mo | ~$0.40 | ~$0.80 |
| CREATION (5 drafts/platform/day cap) | ~30/mo runs | ~$0.15 | ~$4.50 |
| **Image generation** (`image_gen_enabled`, default **off**) | 1 variant/draft × 30 | **~$0.134** (Pro @1K) | **~$4.00 (off by default; ~$12 at 3 variants)** |
| Daily strategist | 30/mo | ~$0.10 | ~$3.00 |
| Analyst (weekly) | 4–5/mo | ~$0.05 | ~$0.25 |
| Search API (Brave + Tavily — **not SerpAPI**, see §12.3) | metered | — | ~$5–15 |
| **Modeled total / tenant-month** | | | **~$25–35** (+~$4–12 if image gen on) |

**Why Tier 0 is free and hourly:** running the *LLM* trend arm hourly would be ~720 runs/tenant-month (24× today), blowing the RESEARCH line and tripping `MONTHLY_BUDGET_USD` mid-month. Tier 0 does cheap change-detection with no LLM; Tier 1 fires only on a real diff. See §12.3.

### Hard caps (harness-enforced, not advisory)

| Cap | Env / setting | Behavior |
|-----|---------------|----------|
| Daily LLM spend per tenant | `DAILY_BUDGET_USD` (default 10) | Warning at 80%; **hard stop** at 100% — jobs pause, event `budget.hard_stop`, UI banner |
| Monthly spend per tenant | `MONTHLY_BUDGET_USD` (default 50) | Same pattern |
| Per-arm run cost | `MAX_RUN_COST_USD` (default 2) | Abort run mid-loop if exceeded; trace preserved |
| Provider intel spend | per-tenant cap set when enabling `IntelProviderAdapter` | Provider calls refused past cap |

**Pricing floor:** subscription price per tenant ≥ 3× modeled cost. At ~$30/mo modeled cost → price from ~$99/mo. Re-validate at every release gate with actuals.

---

## 7. Multi-tenancy model

**One shared PostgreSQL database for all customers.** Isolation is by `tenant_id` on every row — not a separate database per customer.

| Approach | Verdict |
|----------|---------|
| **One DB, `tenant_id` on every table** | ✅ **Selected** — simpler ops, one migration story, one Docker Postgres, cheaper |
| Database-per-customer | ❌ Deferred — only if a large enterprise requires hard isolation later |

### How isolation works

- **Authentication first** — WorkOS AuthKit; every route resolves the caller's identity from the session (§7.2). Without this, the two layers below are one layer with extra steps
- Middleware injects `tenant_id` on every query; no cross-tenant reads
- **Postgres Row-Level Security enabled from day one** (Phase 0.2): every tenant table gets an RLS policy on `app.tenant_id`; middleware/worker sets the session variable per request/job. Cheap now, painful to retrofit
- Credentials, events, drafts, and engagement items are all tenant-scoped
- Demo tenant and real customers share the same schema and instance

Every record is scoped by `tenant_id`. No cross-tenant reads.

### 7.2 Authentication & identity (ADR-002)

**RLS is authorization, not authentication — a lock with no door.** An RLS policy faithfully enforces "this session may only touch rows for `app.tenant_id`." It says nothing about *which tenant the caller actually is*. If `app.tenant_id` were set from the `:id` path parameter, RLS would dutifully isolate whatever tenant an attacker names. Identity must be established before isolation means anything.

| Concern | Rule |
|---------|------|
| Provider | **WorkOS AuthKit** — free to 1M MAU; Organizations map onto `tenants`; SSO/SCIM available as enterprise tenants arrive |
| Identity → tenant | WorkOS Organization ↔ `tenants.id`. Membership is the authorization record |
| **The load-bearing rule** | Every route resolves `tenant_id` **from the session**; `app.tenant_id` is set from that resolved value — **never from a path parameter**. `GET /tenants/:id/...` must verify the session's membership in `:id`, not trust it |
| Workers | BullMQ jobs carry a resolved `tenant_id` from enqueue time; the worker sets `app.tenant_id` from the job record, never from job input |
| Gate | Phase 0: an unauthenticated request to any tenant route returns **401** |

**Why this is urgent even with no platform credentials in v1** (copy_pack-only per ADR-001 means no social tokens are stored): every tenant's strategy, competitor intel, personas, and drafts are cross-tenant readable without it — and unauthenticated endpoints trigger LLM runs, so anyone could burn the OpenRouter budget. The §6.1 caps *meter* spend; they don't *authenticate* the spender.

| Entity | Purpose |
|--------|---------|
| `tenants` | Brand workspace (name, industry, locale, timezone) |
| `tenant_profiles` | Onboarding: description, audience, goals, voice, competitors list, platforms |
| `icp_profiles` | Ideal Customer Profile with `audience_model: b2b \| b2c` — B2B: firmographics, buying triggers, objections; B2C: demographics, psychographics, buying occasions. Strategy prompts branch on this (demo tenant Aurora Coffee = b2c) |
| `personas` | Generated + editable buyer personas (derived from ICP) |
| `messaging_angles` | Positioning angles, hooks, proof points per channel |
| `marketing_plans` | Versioned plans (channels, themes, KPIs, calendar skeleton) |
| `competitors` | Tracked accounts/pages per platform |
| `competitor_alerts` | Detected rival campaigns (new burst of posts/ads/hooks) + status |
| `campaigns` | Your campaigns (goal, status, linked drafts, optional `response_to_alert_id`) |
| `intel_snapshots` | Market, trend, and competitor runs (timestamped, cite sources) |
| `content_drafts` | Copy: channel `social` \| `email`, platform, body, rationale, status |
| `visual_briefs` | Visual direction per draft: format, mood, aspect ratio, Nano Banana prompt, brand refs |
| `generated_assets` | AI-generated images (path/URL, model, prompt used, variant index, draft_id) |
| `approval_queue` | Unified queue: posts, emails, images, schedules, comment replies, **DM replies** |
| `schedules` | Soft calendar entries + optional armed execution |
| `engagement_items` | Inbound social threads: `type=comment` \| `type=message` (DM) + draft replies |
| `daily_briefs` | Daily strategist output per tenant per day |
| `published_items` | **MEASURE anchor**: one row per live post/email — draft_id, platform, url, published_at, mode (`copy_pack` \| `browser` \| `api`) |
| `post_metrics` | Time-stamped metric captures per published item (impressions, reach, likes, comments, shares, clicks, opens, bounces…) — multiple captures = time series |
| `performance_insights` | Analyst output: winning/losing angles, hooks, formats, timing — every claim cites `post_metrics` row ids |
| `platform_connections` | Per-platform settings + publish mode + feature flags |
| `credentials` | Encrypted tokens/secrets per tenant per platform |
| `audit_log` | Compliance subset: approvals, credential changes, publish/send outcomes (append-only) |
| `system_events` | **Full activity stream** — every action and event (see §7.1) |
| `agent_traces` | Per-run LLM/tool observability (steps, tokens, cost, latency, errors) |
| `jobs` | Async arm/campaign job queue state |
| `eval_runs` | Eval suite results per arm / per deploy |

**Demo tenant:** Seed one workspace at install so demos work without setup. Real tenants use the same schema.

---

## 7.1 Database & event logging (system of record)

**PostgreSQL is the single source of truth.** Domain state, agent runs, and a complete action/event history all live there. Nothing important exists only in memory or console logs.

### Three logging layers (do not collapse into one)

| Layer | Table | Answers | Retention |
|-------|-------|---------|-----------|
| **1. Domain state** | `content_drafts`, `schedules`, `intel_snapshots`, etc. | What is the current marketing state? | Forever (product data) |
| **2. Runtime traces** | `agent_traces` | What did the LLM/tools do inside a job? (tokens, cost, steps) | 90 days default; export before purge |
| **3. Action / event stream** | `system_events` | What happened across the whole system? Who did what, when? | Forever (or 1 year + cold archive) |
| **4. Compliance audit** | `audit_log` | Sensitive subset of events for security/compliance review | Forever, append-only |

`system_events` is the **activity feed** in the UI. `audit_log` is a stricter, smaller set (approvals, credential writes, publish/send, toggle changes). Every `audit_log` row also appears in `system_events` (same `event_id`).

### What must be logged (non-negotiable)

Every significant action writes a `system_events` row:

| Category | Examples |
|----------|----------|
| **Tenant lifecycle** | Tenant created, onboarded, settings updated |
| **Feature toggles** | `api_publish_enabled` on/off, publish mode changed |
| **Credentials** | Credential saved / rotated / health-check failed (never store secret values in the event payload) |
| **Campaign / crew** | Campaign started, RESEARCH finished, STRATEGY finished, CREATION finished |
| **Arm jobs** | Job queued, running, completed, failed (link `job_id` + `trace_id`) |
| **Approvals** | Draft created, approved, edited, rejected |
| **Ops** | Scheduled, reminded, armed, published, publish failed, reply sent |
| **Guardrails** | Risk HIGH blocked, permission denied, sanitizer stripped content |
| **Budget** | Daily budget warning / hard stop |
| **Evals** | Eval suite started / passed / failed |
| **Measure** | Item marked published, metrics imported, insight generated, angle score updated |

### `system_events` schema

```typescript
interface SystemEvent {
  id: string;                 // uuid
  tenant_id: string;
  created_at: string;         // ISO timestamp
  actor_type: 'user' | 'system' | 'crew' | 'adapter';
  actor_id?: string;          // user id, persona (alex|sam|jordan|ops), or adapter id
  category: string;           // tenant | toggle | credential | campaign | job | approval | ops | guardrail | budget | eval
  action: string;             // e.g. draft.approved, campaign.started, publish.failed
  resource_type?: string;     // content_draft | schedule | platform_connection | ...
  resource_id?: string;
  job_id?: string;
  trace_id?: string;
  campaign_id?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;            // human-readable one-liner for activity feed
  payload: Record<string, unknown>; // structured metadata — NO secrets, NO full prompt dumps
  ip?: string;                // for user-initiated actions
}
```

### `audit_log` (compliance subset)

Append-only. Same shape as above for: approvals, credential changes, feature toggles affecting publish/reply/email, and every publish/send/reply attempt (success or fail). Immutable — no UPDATE/DELETE from application code.

### `agent_traces` (LLM / tool depth)

| Field | Purpose |
|-------|---------|
| `trace_id` | Correlates all steps in one arm/job |
| `tenant_id`, `arm`, `crew`, `job_id`, `campaign_id` | Scope |
| `steps[]` | action, tool, model, input_tokens, output_tokens, latency_ms, cost_usd, error |
| `status` | running \| completed \| failed |
| `total_cost_usd`, `total_latency_ms` | Aggregates |

**Rule:** Every LLM call appends a step. Every tool call appends a step. Failures are steps with `error`, not silent drops.

### Correlation IDs (how you debug one campaign)

```
campaign_id
  └── job_id (per arm)
        └── trace_id (LLM/tool steps)
              └── system_events (rows tagged with all three IDs)
```

From the UI: open a campaign → see events timeline → click a job → see full trace + cost.

### Control plane UI

| View | Source |
|------|--------|
| **Activity feed** | `system_events` (filter by tenant, category, severity) |
| **Traces / cost** | `agent_traces` |
| **Security audit** | `audit_log` |
| **Campaign history** | `system_events` where `campaign_id = …` |

### What is never logged

- Raw API keys, OAuth tokens, session cookies
- Full unredacted prompts that contain credentials
- Cross-tenant data

PII in event payloads is minimized; redact emails/phones in `payload` when possible.

### Indexes (required for UI performance)

- `system_events (tenant_id, created_at DESC)`
- `system_events (tenant_id, category, created_at DESC)`
- `system_events (campaign_id)`, `system_events (job_id)`, `system_events (trace_id)`
- `agent_traces (tenant_id, created_at DESC)`
- `audit_log (tenant_id, created_at DESC)`

### Implementation note

Write events **synchronously in the same transaction** as the domain change when possible (approval + event together). For LLM traces, write steps incrementally so a crashed job still leaves a partial trace.

---

## 8. The ten arms (mapped to five pillars)

| # | Arm | Pillar | Responsibility | Primary outputs |
|---|-----|--------|----------------|-----------------|
| 1 | **Market** | RESEARCH | SERP, keywords, market demand, category landscape | `intel_snapshots` type=market |
| 2 | **Trend** | RESEARCH | Business-relevant trends (not generic noise) | `intel_snapshots` type=trend |
| 3 | **Competitor** | RESEARCH | Deep analysis + **campaign change detection** | `intel_snapshots` type=competitor, `competitor_alerts` |
| 4 | **Strategy** | STRATEGY | ICP, personas, angles/hooks, marketing plan | `icp_profiles`, `personas`, `messaging_angles`, `marketing_plans` |
| 5 | **Content** | CREATION | Copywriting (social + email) + visual briefs; may call image adapter | `content_drafts`, `visual_briefs` → approval queue |
| 6 | **Daily strategist** | OPS | Daily briefing across email + social | `daily_briefs` |
| 7 | **Scheduler** | OPS | Calendar for email + social; reminders; armed windows | `schedules` |
| 8 | **Engagement** | OPS | Comment **and DM** reply drafts (never silent auto-reply) | `engagement_items` → approval queue |
| 9 | **Publisher** | OPS | Executes **approved** items via channel adapter | audit + status updates, `published_items` |
| 10 | **Analyst** | MEASURE | Interprets deterministic stats; scores angles; produces insights (**never computes stats itself**) | `performance_insights`, angle scores |

**Lazy-loaded tools per arm:**

| Arm | Tools |
|-----|-------|
| Market | `search_serp`, `search_web`, `query_intel_history` |
| Trend | `search_web`, `fetch_feed`, `query_intel_history` |
| Competitor | `fetch_web_page`, `fetch_feed`, `search_web`, `read_pasted_intel`, `fetch_provider_data` (if provider enabled), `query_intel_history`, `detect_campaign_change` |
| Strategy | `read_profile`, `write_icp`, `write_personas`, `write_angles`, `write_plan` |
| Content | `read_plan`, `read_angles`, `read_intel`, `write_draft`, `write_visual_brief`, `generate_image` (only if `image_gen_enabled`) |
| Daily strategist | `read_all_tenant_state`, `trigger_content_if_needed` |
| Scheduler | `read_calendar`, `write_schedule`, `enqueue_execution` |
| Engagement | `read_comments`, `read_messages`, `write_reply_draft` |
| Publisher | `resolve_adapter`, `publish`, `replyToComment`, `replyToMessage`, `send_email` (when enabled) |
| Analyst | `read_metric_stats` (pre-computed), `read_published_items`, `read_angles`, `write_insights`, `update_angle_scores` |

Arms 1–8 are **read/analyze/draft**. Arm 9 is **execute** and only runs after approval + mode selection + permission check. Arm 10 is **read/interpret** — post-hoc analysis only, no external actions and no raw-number crunching (stats come pre-computed from `src/metrics/`).

### Handoff contract

Each arm returns a structured `ArmResult`:

```typescript
interface ArmResult<T> {
  arm: ArmId;
  tenantId: string;
  traceId: string;
  summary: string;           // 1–2k tokens max for Brain consumption
  data: T;                   // typed payload persisted to DB
  citations?: string[];      // required for intel arms
  confidence?: number;
  errors?: ArmError[];
}
```

Brain never ingests raw search results or full competitor pages — only `summary` + typed `data`.

### Parallelism

Market, Trend, and Competitor arms run **concurrently** during RESEARCH (`Promise.all`). Strategy waits for fresh intel. Daily strategist waits for strategy + latest creation queue state.

---

## 8.2 Image generation — Nano Banana (optional CREATION step)

**Decision:** Use Nano Banana (Google Gemini image models) for **pixels only**. Jordan (LLM via OpenRouter) writes copy and the image prompt. Images never auto-publish.

### Split of responsibility

| Step | Owner | Output |
|------|-------|--------|
| Caption / email copy | Jordan (OpenRouter) | `content_drafts` |
| Visual brief + image prompt | Jordan | `visual_briefs` (SCALD-style: subject, context, aesthetics, layout, directive) |
| Generate image variants | **Image adapter** (Nano Banana / Gemini) | `generated_assets` (1–N files) |
| Approve copy + image | Human | approval inbox |
| Publish | Ops (copy pack / browser / API) | after approval |

### Feature flag

```yaml
image_gen_enabled: false            # tenant-level; default off
image_gen_provider: gemini          # gemini | stub
image_gen_model: gemini-3-pro-image # see model table below
image_gen_max_variants: 1           # per draft; ≥2 needs explicit tenant opt-in (cost)
image_gen_default_size: "1024x1024" # native tier — 1K | 2K | 4K
```

> **Corrected 2026-07-17 (ADR-003).** Two earlier errors: (1) **`nano_banana` and `gemini` were listed as separate providers — they are the same thing.** "Nano Banana" is a marketing nickname for Google's Gemini image models: same API, same SDK, same auth; only the model string changes. (2) **`1080x1080` is not a native output size** — native tiers are 1K (1024×1024), 2K, 4K. Resample post-generation if a channel spec needs exactly 1080.

| Marketing name | Model ID | Cost @1K |
|---|---|---|
| Nano Banana (Aug 2025) | `gemini-2.5-flash-image` | $0.039 flat |
| Nano Banana 2 | `gemini-3.1-flash-image` | $0.067 |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | ~$0.034 |
| **Nano Banana Pro** (default) | `gemini-3-pro-image` | **$0.134** |

When `image_gen_enabled` flips on → credential wizard for Google AI / Gemini API key → `validateCredentials` → encrypt → health check.

**SDK:** `@google/genai`. **`@google/generative-ai` is deprecated** (Nov 30, 2025). *Unverified:* current docs are titled "Interactions API" and samples use `ai.interactions.create({model, input})` rather than `generateContent` — **confirm the method shape against live docs before locking `ImageAdapter`.**

**Cost reality — why `image_gen_enabled: false` is doing economic work, not just caution:** at Nano Banana Pro 1K, 3 variants = **$0.40/draft**. At §25's cap of 5 drafts/platform/day that exceeds the entire ~$25-35 modeled tenant-month (§6.1). Variants are **N sequential calls** — there is no native multi-candidate parameter. Default `max_variants` to 1; gate ≥2 behind explicit tenant opt-in.

**SynthID watermarking is applied to every generated image** with no documented API opt-out. Commercial-use implications for API callers are **unverified** — legal read before selling generated assets to tenants.

**Content policy:** expect friction generating identifiable people, public figures, and third-party trademarked logos. Whether passing a *tenant's own logo* as a reference image is exempt is **unconfirmed** — validate early, since the brand-consistency rule below depends on it.

### Flow

```
Jordan: write draft + visual_brief
  → if image_gen_enabled:
       ImageAdapter.generate({ prompt, size, brand_refs, variants })
       → store generated_assets (URLs/paths, model, cost)
  → else:
       visual_brief only (copy pack includes "image prompt for designer / Nano Banana")
  → approval inbox (approve / reject / regenerate image)
```

### Adapter interface

```typescript
interface ImageAdapter {
  provider: 'gemini' | 'stub';   // "Nano Banana" is a Gemini model, not a provider (ADR-003)
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  healthCheck(tenantId: string): Promise<HealthResult>;
  generate(input: {
    prompt: string;
    model: string;              // gemini-3-pro-image | gemini-3.1-flash-image | ...
    aspectRatio: '1:1' | '9:16' | '16:9' | '4:5';  // all supported; API also has 3:2, 4:3, 5:4, 21:9
    resolution?: '1K' | '2K' | '4K';               // default 1K (1024x1024)
    brandRefUrls?: string[];    // object/style refs — see limits below
    variants: number;           // 1-3 → N sequential calls; no native multi-candidate param
  }): Promise<{ assets: GeneratedAsset[]; costUsd: number }>;
}
```

**Scaffold in v1:** full interface + stub that returns placeholder URLs; real Gemini client when credentials present. Same pattern as social API adapters.

**Vertex AI vs Developer API:** `@google/genai` supports both. Vertex gives per-project IAM/service-account isolation and cleaner billing separation for multi-tenant; Developer API keys are simpler. *Unverified this pass* — decide before locking the isolation model.

### Brand consistency rules

- Tenant may upload logo / style reference images (stored under tenant assets)
- Every generate call includes brand refs when available
- **Reference-image limits are real and model-dependent** — this is the strongest reason to stay on Gemini: Nano Banana 2 accepts **10 object + 4 character + 3 style** refs; Nano Banana Pro **6 object + 5 character** (no dedicated style channel). Pick Nano Banana 2 if style-ref count matters more than raw quality
- Style anchor from `tenant_profiles.voice` / visual guidelines
- Cap: `image_gen_max_variants` (default **1**); cost logged to `agent_traces` + `system_events` (`image.generated`)
- **Text rendering:** Gemini is strong but Ideogram/GPT Image are still cited ahead on typography accuracy. Validate against real creative templates before treating text-in-image as solved

### What Nano Banana must not do

- Write strategy, ICP, captions, or schedules
- Publish or send without human approval
- Run when `image_gen_enabled` is false

### Events

| Action | Event |
|--------|-------|
| Image generated | `image.generated` (asset ids, cost, draft_id) |
| Regenerate requested | `image.regenerate_requested` |
| Image approved / rejected with draft | approval events |

---

## 9. Tool layer

### Lazy tool registry

Do not inject all tools into every LLM call. Register tools globally; expose only the subset for the active arm. Principle: fewer, sharper tools beat a giant tool list.

| Arm active | Tools visible to model |
|------------|------------------------|
| Market | SERP search, web search, intel history |
| Trend | search, feed, intel history |
| Competitor | web page fetch, feeds, search, pasted intel, provider data (toggled), intel history |
| Strategy | profile, ICP, personas, angles, plan write |
| Content | plan, angles, intel read; draft + visual brief write; `generate_image` if enabled |
| Publisher | adapter resolve, publish, replyToComment, replyToMessage, send_email (only after approval exists) |

### Tool execution rules

- Validate arguments against JSON schema before execution.
- Read-only tools may run concurrently; mutating tools run serially per tenant.
- Return errors as structured observations so the model can self-correct (max 2 retries per Stripe pattern).
- External web content is **untrusted** — sanitize before entering context (see §16).

---

## 10. Publish & reply modes (per tenant, per platform)

Two execution adapters in v1; browser publish is **deferred post-v1** (ADR-001, §10.0). Default activation:

| Adapter | ID | Default | Use when |
|---------|-----|---------|----------|
| Copy pack | `copy_pack` | **On** | User pastes into native app; zero account risk; full control |
| API | `api` | Off | User enables flag + saves credentials; official platform APIs only |
| Browser | `browser` | **Deferred post-v1** | Reserved flag; see ADR-001 |

**Publish principle (revised):** Copy pack is the default because it carries zero account risk and works on every platform. When tenants want automation, use **official APIs** — with no reach cost. The earlier claim that API publishing penalizes organic reach is **refuted**, not merely unproven: four controlled tests found API-published posts get equal or *higher* reach (ADR-001). Reach differences come from content quality, format, links, and timing — not the publish channel.

### Feature flag matrix (`platform_connections`)

```yaml
publish_mode: copy_pack | api              # default copy_pack; `browser` value reserved (ADR-001)
browser_publish_enabled: false             # reserved — no v1 implementation (ADR-001)
api_publish_enabled: false
api_reply_enabled: false                   # public comments
api_dm_reply_enabled: false                # private messages / DMs
api_ads_enabled: false                     # future: paid campaigns
require_approval_for_publish: true         # always true in v1
require_approval_for_reply: true           # comments AND DMs — always true in v1
```

When user toggles `api_*_enabled` → UI prompts for credentials → validate → encrypt → store in `credentials` → run adapter health check.

### Permission model (separate from model reasoning)

The model **proposes** actions. The harness **permits** them.

```
propose (Content/Engagement arm)
  → risk assessor classifies action
  → approval inbox (human for HIGH risk)
  → arm for execution (browser/api)
  → permission check (flags + credentials + tenant scope)
  → adapter executes
  → audit log + trace
```

### Risk levels

| Level | Actions | Behavior |
|-------|---------|----------|
| **LOW** | Read profile, search web, generate drafts | Auto-execute |
| **MEDIUM** | Schedule item, create draft, generate image | Auto-execute + audit |
| **HIGH** | `post_public`, `reply_comment`, `reply_message`, `publish`, `delete`, spend | **Require human approval**; never auto-execute in v1 |

### Human gates (non-negotiable)

1. **Recommend** → user sees draft in approval inbox  
2. **Approve / edit / reject** → only approved items enter scheduler or publisher  
3. **Arm for execution** (browser/api) → explicit per item or per batch  
4. **Execute** → adapter runs; result logged; failures retry with checkpoint  

No silent publish. No silent auto-reply on comments **or DMs**.

---

## 10.0 ADR-001 — Browser (Playwright) publishing deferred post-v1

**Decision (2026-07-17):** The in-app Playwright publisher originally planned for Phase 7 is **deferred indefinitely**. `browser_publish_enabled` stays as a reserved flag; no v1 implementation.

**Full evidence:** [`docs/adr/0001-browser-publishing-deferred.md`](adr/0001-browser-publishing-deferred.md) — primary sources for every claim below, plus the ToS/litigation record.

### Why (supersedes the earlier "organic reach" rationale)

| Concern | Detail |
|---------|--------|
| **Customer account risk** *(strongest)* | Bot detection is aggressive; the accounts at risk belong to **tenants**, not us — a ban destroys their business asset and our reputation. Platforms don't need to sue; they ban, and that decision has no appeal |
| **ToS violation** | LinkedIn is explicit — User Agreement §8.2 bans automated methods to "create, comment on, like, share, or re-share posts," **on your own account**. Meta's terms cover automation "regardless of whether... logged-in." Note the nuance: *Van Buren* (SCOTUS 2021) means own-account automation is **not** a CFAA crime — but contract exposure is real (hiQ v. LinkedIn ended in a **$500K judgment against hiQ**). Don't overstate this as "illegal"; the account-risk row above is the load-bearing one |
| **Customer account risk** | Bot detection is aggressive; the accounts at risk belong to **tenants**, not us — a ban destroys their business asset and our reputation |
| **Indefensible intent** | Human-like delays/typing cadence is deliberate detection evasion — indefensible if challenged |
| **Breach blast radius** | Storing tenants' session cookies creates a worst-case full-account-takeover scenario |
| **Refuted premise** | The claim that API posts are penalized on organic reach is **refuted**, not just unproven — four controlled tests show API-published posts get **equal or higher** reach (Agorapulse +22.6%; Hootsuite 10,122 vs 7,189; Social Status +10.3%; CoSchedule "no significant difference"). Facebook did down-rank API posts ~2011 and explicitly fixed it; the belief outlived the mechanism by ~15 years. Reach differences come from content quality, format, links, and timing — not publish channel. Evidence + caveats: **ADR-001** |

### What replaces it

- **Copy pack** (default) — covers organic publishing on every platform with zero account risk
- **Official APIs** (Phase 8, toggled) — for tenants who want automation

### Revisit conditions (all required)

1. Measured, tenant-level data showing a meaningful reach penalty for API-published posts
2. A ToS-compliant execution path (e.g. platform-sanctioned automation)
3. Explicit tenant consent flow acknowledging residual risk

### Playwright MCP (unchanged)

Playwright MCP remains a **dev/QA tool only** — the `verify` skill, dashboard smoke tests, demo flows. It never touches tenant sessions or production data.

It is not merely *scoped* to QA — it is **unfit** for production publishing on two independent counts (ADR-001):

1. **Not built for backend automation.** Microsoft's README states "Playwright MCP is **not** a security boundary" and steers agents away from MCP; the maintainer rejected a backend-runtime-engine request outright ("This does not allow with our vision"). It also burns ~15k tokens of tool definitions before acting.
2. **Zero anti-detection.** It is stock Playwright — `navigator.webdriver`, the `Runtime.enable` CDP leak, and automation flags are all present. Using it to appear human would achieve the exact opposite.

If ADR-001's revisit conditions are ever met, the correct shape is a **deterministic worker driven by BullMQ** — no MCP, no LLM per step. Login → compose → post is a fixed script; an LLM deciding each click adds cost, latency, and nondeterminism to a flow that needs none. **LinkedIn is excluded permanently regardless.**

---

## 10.1 Engagement — comments & private messages

Both inbound surfaces use the same approval path. They differ in privacy and adapters.

| Kind | `engagement_items.type` | Examples | Fetch (v1 → later) | Send when armed |
|------|-------------------------|----------|--------------------|-----------------|
| **Comment** | `comment` | FB/IG post comments, X replies under a post | Paste thread → browser/API fetch | `replyToComment` (API or browser) |
| **Message (DM)** | `message` | FB Messenger, IG inbox, X DMs, LinkedIn messages | Paste thread → browser/API fetch | `replyToMessage` (API or browser) |

### Shared flow (both kinds)

```
Inbound thread (comment or DM)
  → Engagement arm drafts reply (Jordan-style voice from tenant profile)
  → approval inbox (type visible: Comment | Message)
  → human approve / edit / reject
  → if armed + flag on: Publisher sends via adapter
  → else: copy pack (ready to paste into native inbox)
```

### Privacy rules (stricter for DMs)

- DMs often contain PII — redact phone/email in `system_events` / traces where possible
- Never log full DM bodies into LLM eval fixtures without sanitization
- `api_dm_reply_enabled` is separate from `api_reply_enabled` so tenants can allow comment replies without opening DMs
- Browser DM assist uses isolated session; no cross-tenant cookies

### Daily strategist

Daily brief includes: comments needing replies **and** unread DM drafts in the approval queue.

---

## 11. Credential vault

| Field | Notes |
|-------|-------|
| Storage | **Envelope encryption** (AES-256-GCM): `CREDENTIALS_MASTER_KEY` (KEK) encrypts one DEK per tenant; tenant secrets encrypted with their DEK. KMS-ready interface |
| Rotation | KEK rotation re-encrypts DEKs only (not every credential row); per-tenant DEK rotation supported; runbook in `docs/security.md` |
| Scope | `tenant_id` + `platform` + `credential_type` |
| Types | `oauth_tokens`, `api_key` (no session cookies — browser publish deferred, ADR-001) |
| UX | Settings → Platform → Enable API → wizard asks required fields |
| Validation | Adapter `validateCredentials()` before save; periodic `healthCheck()` |

**Never** commit credentials. Rotate any keys that were pasted into notes files **immediately** (this happened with an OpenRouter key in `nots.md` — rotate it in the OpenRouter dashboard).

---

## 12. Intelligence sources (trends & competitors)

**Principle:** Model pulls context via tools; don't stuff everything into one prompt.

**Data-source decision (locked — closes the "how do we actually get competitor data" gap):** Facebook/Instagram/X aggressively block scraping and require login for most content — `fetch_public_profile` against social platforms is **not** a viable primary source. Competitor intel uses ToS-safe tiers; social-post-level data comes only from a paid provider adapter or user-pasted intel.

| Tier | Source | Tool | Cost / notes |
|------|--------|------|--------------|
| 1 | SERP + web search (**Brave / Tavily — not SerpAPI**, §12.3) | `search_serp`, `search_web` | Metered API, budgeted in §6.1; covers competitor sites, news, launches |
| 1 | Competitor websites, blogs, newsletters, RSS | `fetch_web_page`, `fetch_feed` | Free; robots.txt respected; sanitized (§16) |
| 2 | User-pasted intel (screenshots/text of competitor posts) | `paste_intel` (UI) | Free; v1 answer for social-post-level signals |
| 3 | **Paid data provider adapter** (Apify / Bright Data / official APIs) | `IntelProviderAdapter` (optional, per-tenant credential + monthly cost cap) | ~$50–500+/mo depending on volume — priced into tenant plan before enabling; **decision + pricing required before R2**, not assumed |
| — | Stored intel | `query_intel_history` | Week-over-week comparison |
| — | Campaign diff | `detect_campaign_change` | Diffs whatever tiers above provided vs last snapshot |

**Never:** login-gated scraping of social platforms, fake accounts, or evading anti-bot measures.

Competitor arm outputs structured analysis:

- Posting cadence & formats  
- Top hooks / themes  
- Engagement patterns (where visible)  
- Gaps vs your positioning  
- Actionable recommendations for content arm  
- **Campaign change signals** (see §12.1)

Trend arm filters for **business relevance** — not viral noise unrelated to tenant profile.

**Citation rule:** Intel snapshots without `citations[]` fail eval gate and are not shown to Content arm.

---

## 12.3 Intel cadence — hourly watch, event-driven analysis (ADR-003)

**Decision:** trends are **checked hourly** and **analyzed on change**. The LLM Trend arm does *not* run hourly.

### Why not hourly analysis

| Reason | Detail |
|---|---|
| **Budget** | 720 LLM runs/tenant-month vs ~30 today (24×). Breaks §6.1's RESEARCH envelope and trips `MONTHLY_BUDGET_USD` mid-month — the caps would fire as designed and the product would stop working |
| **Signal** | Google *Trending Now* refreshes ~10 min and *Daily Trends* hourly — but that measures **viral breakout volatility**, not "did anything change for a bakery or an HVAC company." SMB-relevant shifts move **daily-to-weekly**. Hourly analysis reproduces the same trend ~20×/day — directly contradicting this section's own "business relevance, not viral noise" rule |

### The tier split

| Tier | Cadence | Cost | What runs |
|---|---|---|---|
| **Tier 0 — watch** | **Hourly** | ~free, **no LLM** | Conditional-GET RSS/Google Alerts (`If-None-Match` / `If-Modified-Since` → `304`, empty body) + one cheap Brave call. Fingerprint, compare to last stored |
| **Gate** | — | — | Materially unchanged → **stop**. No LLM, no snapshot row, no alert |
| **Tier 1 — analyze** | Event-triggered (~1–4×/day/tenant steady state) | full arm | On real diff: multi-call search + LLM Trend arm with citations → `intel_snapshots` type=trend |
| **Fallback** | 24h max | full arm | Force Tier 1 at least every 24h even with no detected change — preserves the existing staleness SLA |

**This mirrors a pattern already in the design.** §12.1 defines `detect_campaign_change` for competitors and Task 1.4b runs competitor watch in "light mode," alerting only on signal. The Trend arm takes the same shape — the codebase gains one consistent watch-then-analyze idiom instead of two.

### Dedup

Normalize (title + top snippet) → fingerprint with **SimHash (64-bit)** or a small embedding. Near-duplicate → bump `last_seen`, no new row, no re-alert, when **Hamming ≤ 3/64** or **cosine ≥ 0.90**. Below threshold → new record + Tier 1. *(Standard IR/dedup ranges — SimHash ≤3–6/64, cosine 0.85–0.92 — tune against fixtures at the Phase 1 gate.)*

### Source selection (ToS-safe + inside the ~$5–15 intel budget, at 720 polls/tenant-month)

| Source | Verdict |
|---|---|
| **RSS / Google Alerts RSS** | **Primary Tier-0 layer** — free, unlimited with polite conditional-GET |
| **Brave Search API** | **Viable** — $5/1k requests, $5 free credit/mo, 50 qps → ~$0–8/tenant-mo. Cheapest paid option |
| **Tavily** | **Viable, sparingly** — 1k free credits/mo, $0.008/credit PAYG, basic search = 1 credit. Keep for Tier-1 quality calls |
| **Exa** | Probably viable — official page claims 20k req/mo free but conflicts with third-party trackers. **Verify in-dashboard first** |
| **SerpAPI** | **Disqualified** — cheapest plan is $25/mo, exceeding the entire intel budget on its own. *Still named in `.env.example` and Task 1.1 — remove* |
| **Google Trends official API** | **Not usable** — alpha, allowlist-gated since July 2025, not GA, no public pricing |
| **pytrends / unofficial Trends** | **Disqualified by §12's ToS-safe rule.** Also archived April 2025 |
| **Reddit API** | **Disqualified** — free tier explicitly non-commercial; commercial has a **$12,000/yr minimum**. *(Inferred from third-party trackers — verify before any adoption)* |
| **YouTube Data API v3** | Free 10k units/day, but quota is **product-wide, not per-tenant** — ~4 tenants at hourly cadence exhaust it. Not a scaling Tier-0 source |

**Push beats poll where available:** WebSub/PubSubHubbub gives true push for RSS/Atom when the publisher supports a hub — adopt opportunistically, not as primary plumbing (adoption is spotty).

---

## 12.1 Competitor campaign watch + counter-campaign

**Your ask (locked):** Keep tracking competitors. When a competitor launches a campaign, you get notified and the agent helps you create a **competing / counter campaign** (posts + optional images) — with your approval before anything publishes.

### A) Creating your posts & campaigns (already in CREATION + campaign pipeline)

| You want | How the agent does it |
|----------|------------------------|
| Create posts | Jordan: `content_drafts` (+ visual briefs + optional Nano Banana) |
| Run a full campaign | `POST /campaign/run` → RESEARCH → STRATEGY → CREATION → **your approval** → OPS |
| Schedule / publish | Soft schedule + copy pack / browser / API when armed |

### B) Continuous competitor tracking

| Setting | Default |
|---------|---------|
| `competitor_watch_enabled` | On |
| Watch interval | Every 6–24h (tenant configurable) or on daily strategist |

On each watch cycle:

1. Fetch latest competitor signals via the **§12 source tiers**: SERP + competitor sites/RSS always; social-post signals only when the paid provider adapter is enabled or the user pasted intel (watch quality scales with enabled tiers — set this expectation in the UI)  
2. Diff vs previous `intel_snapshots` / stored post fingerprints  
3. If **campaign signal** detected → create `competitor_alerts` row + `system_events` (`competitor.campaign_detected`)  
4. Surface in UI: Research → Alerts + optional notification  

**Campaign signal heuristics** (any combination → alert):

- Burst of new posts in a short window (e.g. 3+ in 48h vs baseline)  
- New recurring hook / offer / hashtag cluster  
- New creative theme (product launch, promo, seasonal)  
- Ad / promo language detected in copy ("sale", "launch", "limited", etc. — configurable)  

### C) Counter-campaign assist (compete)

When you open an alert (or click **Create counter-campaign**):

```
competitor_alert (what they did + citations)
        ↓
Brain starts campaign with kind = counter
        ↓
STRATEGY: angles that respond (differentiate / match offer / own the narrative)
        ↓
CREATION: post set + optional images aimed at the same audience moment
        ↓
Approval inbox — you pick what ships
        ↓
OPS schedule / publish
```

`campaigns` row links:

- `kind`: `proactive` | `counter`  
- `response_to_alert_id`: the competitor alert (when counter)  
- Linked drafts so you see “this campaign answers Competitor X’s launch”

### D) What this is not

- Not scraping private ads accounts illegally — public pages / allowed APIs / pasted intel only  
- Not auto-publishing a counter-campaign — human gate always  
- Not copying competitor creative verbatim — strategy differentiates using your ICP/voice  

### Events

| Action | Event |
|--------|-------|
| Watch cycle ran | `competitor.watch_ran` |
| Rival campaign detected | `competitor.campaign_detected` |
| Counter-campaign started | `campaign.counter_started` |
| Counter drafts ready | `campaign.creation_finished` |

---

## 12.2 MEASURE pillar — metrics + performance feedback loop

**Principle (locked):** Two layers, kept strictly separate. A **deterministic metrics pipeline** (code) ingests numbers and computes stats; the **Analyst arm** (LLM) only interprets the computed stats. The model never does arithmetic and never estimates performance. This mirrors the existing "judge ≠ producer" and "harness permits, model proposes" separations.

### Why

Without measurement the agent is a content mill: it never learns which angles, hooks, formats, or timings work for a given tenant. `performance_insights` are the feedback signal that makes STRATEGY and CREATION improve per tenant over time — and the per-tenant data moat competitors cannot copy.

### Layer 1 — deterministic metrics pipeline (`src/metrics/`)

| Step | What |
|------|------|
| **Anchor** | `published_items` row per live post/email (draft_id, platform, url, published_at, mode). Created by **"Mark as published"** (copy pack), browser publish, API publish, or email send |
| **Ingest** | Metric captures → `post_metrics`; multiple captures per item form a time series |
| **Compute** | Engagement rate, CTR, open/click rate; deltas vs tenant rolling baseline; noise band; min-sample checks — all in code with unit tests, no LLM |

**Copy-pack gap rule (non-negotiable):** the system cannot see copy-pack posts go live. The approval inbox and calendar include a **Mark as published** action (with optional post URL) that creates the `published_items` anchor. Without it there is nothing to attach metrics to.

### Metric sources (tiered)

| Tier | Source | When | Notes |
|------|--------|------|-------|
| 0 | **UTM tagging** on every draft link | Phase 3 (always on) | `utm_campaign=campaign_id`, `utm_content=draft_id`; free now, enables conversion attribution later |
| 1 | **Manual entry / CSV import** | Phase 3.5 (v1 default) | Paste numbers or upload the Meta Business Suite / X Analytics export |
| 2 | **Email webhooks** (SendGrid / Resend) | Phase 8 | Delivered / opens / clicks / bounces / unsubscribes — first fully automated channel |
| 3 | **Own-page Graph API insights** | Post-v1 | Reading metrics for the tenant's **own** pages is ToS-safe (unlike competitor scraping) |
| 4 | GA4 / landing-page analytics import | Post-v1 | Consumes Tier 0 UTM tags for conversion attribution |

### Layer 2 — Analyst arm (Riley)

- Input: **computed stats only** — never raw platform HTML, never raw-number crunching
- Output: `performance_insights` — winning/losing angles, hooks, formats, posting times; **every claim cites `post_metrics` row ids** (same rule as intel citations)
- Side effect: updates `messaging_angles.performance_score`; weak angles are retired with a stated reason, never silently
- Cadence: weekly BullMQ job per tenant + on-demand after a metrics import
- `MODEL_BALANCED` tier

### Guardrails

- **Min sample size:** no insight unless n ≥ 5 published items per angle/format **and** the delta beats the noise band vs the tenant's rolling baseline. Below threshold → insight tagged `provisional` and **excluded** from Strategy/Creation context
- Insights without citations fail the eval gate (same as intel snapshots)
- `measure_enabled` toggle (default on) controls ingestion + Analyst cron

### KPI taxonomy (plans must use it)

`marketing_plans` KPIs are constrained to this taxonomy so plan goals and measured numbers share one vocabulary:

| KPI class | Metric |
|-----------|--------|
| Awareness | Impressions / reach |
| Engagement | Engagement rate (interactions ÷ reach) |
| Traffic | CTR |
| Conversion | UTM-attributed events (Tier 4) |
| Email | Open rate, click rate, unsubscribe rate |

### Feedback wiring (closing the loop)

1. **STRATEGY:** Sam's prompts include top/bottom performing angles when regenerating; scores live on `messaging_angles`
2. **CREATION:** Jordan's context includes a "what worked" summary (≤ ~300 tokens) from the latest insights — consistent with min-sufficient-context
3. **OPS:** the daily strategist reads the latest `performance_insights` (this is the source for the "performance notes" in §13)

### Events

| Action | Event |
|--------|-------|
| Item marked published | `item.published` |
| Metrics imported | `metrics.imported` |
| Insight generated | `insight.generated` |
| Angle score updated | `angle.score_updated` |

---

## 13. Daily strategist loop

Runs once per tenant per day (cron or manual trigger):

```
1. Load tenant profile + active plan + latest `performance_insights` (MEASURE, §12.2)
2. Parallel: refresh trend + competitor intel if stale > 24h
3. Brain synthesizes daily_brief:
   - Priority platforms today
   - 1–3 content angles
   - Competitor move to respond to (or ignore) — **include open competitor_alerts**
   - Counter-campaign CTA if new alert since yesterday
   - Scheduled items due
   - Comments / DMs needing reply drafts
4. Content arm generates draft posts if queue is thin
5. Surface everything in dashboard + optional notification
6. Write trace + eval hooks for brief quality
```

---

## 14. Scheduling model (hybrid C)

| Type | Behavior |
|------|----------|
| **Soft schedule** | Calendar slot + reminder + copy pack ready at T-minus |
| **Armed API** | At scheduled time, if `api_publish_enabled` + creds valid + item armed → Publisher uses official API adapter |
| ~~Armed browser~~ | **Deferred post-v1** (ADR-001, §10.0) |

Scheduler stores checkpoint: `pending | reminded | executing | published | failed | skipped`. Failed at step N resumes from N.

---

## 15. Error handling

A 10-step flow at 99% per-step success ≈ 90.4% end-to-end. Plan for compounding failure.

| Error class | Examples | Recovery |
|-------------|----------|----------|
| **Transient** | Rate limit, network timeout, 503 | Retry with exponential backoff (max 2) |
| **LLM-recoverable** | Bad tool args, parse failure | Return error as tool observation; model retries |
| **User-fixable** | Missing credentials, approval rejected | Interrupt → surface in UI → resume after fix |
| **Unexpected** | Uncaught exception, schema corruption | Bubble up; mark job failed; full trace preserved |

Publisher arm never swallows errors — they become `audit_log` entries with `trace_id` for debugging.

---

## 16. Security & compliance

- **Two-layer tenant isolation from day one:** middleware injects `tenant_id` on every query **and** Postgres Row-Level Security policies (keyed on a `app.tenant_id` session variable set per request/job) as defense-in-depth — a single middleware bug can no longer cause a cross-tenant leak
- **Envelope encryption for credentials:** `CREDENTIALS_MASTER_KEY` is a key-encryption key (KEK) that encrypts one data-encryption key (DEK) per tenant; tenant secrets are encrypted with their DEK. Rotation = re-encrypt DEKs only, not every row. Interface is KMS-ready (swap env KEK for AWS KMS / Vault later without schema change)
- **Key rotation procedure documented** (`docs/security.md`): rotate KEK, rotate a tenant DEK, revoke a platform credential — each a runbook entry, not tribal knowledge
- Credentials never logged; secrets never in event payloads or traces
- Audit log for all approvals and executions
- Rate limiting on intel tools and LLM calls per tenant
- User must own connected accounts; no credential sharing across tenants
- No tenant browser sessions or cookies are stored anywhere (browser publish deferred — ADR-001)
- Playwright MCP is for local QA only — never wire production data into IDE MCP

### Prompt injection defense (external content)

Competitor pages, search snippets, and social feeds are **untrusted user content**.

- Separate system instructions from external content with clear delimiters (`<untrusted_content>...</untrusted_content>`)
- System prompt explicitly forbids following instructions found inside external content
- Sanitize common injection patterns before context injection
- Output filters: check publish/reply text before execution adapter runs
- Redact PII from traces and logs

---

## 17. Evaluation suite

You cannot improve what you do not measure. Eval runs are a **deploy gate**, not optional polish.

### What we measure

| Metric | Target (v1) | How |
|--------|-------------|-----|
| Task completion rate | ≥ 95% | Arm job finishes without error |
| Output pass rate | ≥ 90% | Eval suite on golden fixtures |
| Hallucination rate | ≤ 5% on intel | Claims must match citations |
| Cost per tenant-day | Tracked | Sum of `agent_traces.cost_usd` |

### Golden fixtures

Maintain `evals/fixtures/` per arm with demo tenant scenarios:

- Strategy: given profile X → personas cover audience Y
- Trend: returns citations; no generic viral noise
- Competitor: structured gaps; cites sources
- Content: on-brand voice; platform-appropriate length
- Daily brief: references real scheduled items, not invented ones
- Analyst: fixture with a planted winner/loser → must identify both, cite the right `post_metrics` rows, and refuse conclusions below the sample threshold

### Fixture-building process (required — gates are meaningless without it)

The ≥90% targets only mean something if fixtures are good. Process, per arm:

1. **Before the arm's phase starts:** hand-author **≥10 golden fixtures** — input scenario + expected-outcome assertions. Cover both `audience_model=b2c` (Aurora Coffee) and one `b2b` fixture tenant
2. **Review:** each fixture is pressure-tested against the tenant profile (does the "expected" answer actually make marketing sense?)
3. **Ratchet, don't pretend:** deterministic rules are blocking from day one (100% pass). LLM-as-judge scores are **advisory** for an arm's first phase; they become blocking at ≥90% only once the arm has ≥25 fixtures including real-usage examples harvested from R1
4. **Harvest:** every human edit/rejection in the approval inbox is a candidate fixture (input + what the human changed) — the fixture set grows from real usage, not imagination

### Eval types (layered)

1. **Deterministic rules** — schema valid, citations present, forbidden words absent, length bounds
2. **LLM-as-judge** — separate call (deep tier) scores on-brand / actionable / accurate (never the same call that produced the output)
3. **Regression** — compare eval scores across deploys; block if pass rate drops > 5%

Eval results stored in `eval_runs`. Ship-loop gate requires eval pass before phase complete.

---

## 18. Observability & tracing

When an agent misbehaves in production, you need to see inside it. Full action/event logging is defined in **§7.1**. This section covers runtime traces and ops dashboards.

### Per-run trace (`agent_traces`)

See §7.1 for the field list. Summary:

| Field | Purpose |
|-------|---------|
| `trace_id` | Correlates all steps in one arm/job run |
| `tenant_id`, `arm`, `crew`, `job_id`, `campaign_id` | Scope |
| `steps[]` | action, tool, model, tokens, latency, cost, error |
| `status` | running \| completed \| failed |
| `total_cost_usd`, `total_latency_ms` | Aggregates |

Every LLM and tool call is a step. Link every `system_events` job/ops row to its `trace_id`.

### Dashboards & alerts

- Activity feed from `system_events`
- Cost per tenant per day / per arm (`agent_traces`)
- P95 latency per arm
- Failure rate by tool and adapter
- Alert: tenant exceeds daily budget; failure rate > 5%; publish arm errors

### Async job API pattern

Long arm runs must not block HTTP:

- `POST /tenants/:id/jobs` → returns `job_id` immediately
- `GET /jobs/:id` → poll status + result
- Background worker executes arm; writes `agent_traces` + `system_events` incrementally

---

## 19. Build workflow — the completion gate

> **Corrected 2026-07-17.** This section previously specified four skills — `ship-loop`,
> `structural-code-review`, `frontend-visual-qa`, `grill-with-docs` — plus an `AGENTS.md`
> ruleset and a `../skills/` directory. **None of them existed anywhere.** The *intent* of
> each was sound, so each is mapped below to a real tool. The gate is otherwise unchanged.

| Step | Real tool | When |
|------|-----------|------|
| Plan and slice | `docs/phase-prompt.md` | Start of every phase |
| Pressure-test the slice against the spec *(was `grill-with-docs`)* | Inline: read `design.md` + `docs/adr/`; contradiction ⇒ stop and ask | Before implementing |
| Test-first implementation | `superpowers:test-driven-development` | Every task |
| Verify — real commands, real output *(was `ship-loop` gate)* | `superpowers:verification-before-completion` + `npm test` + `npm run build` + the phase's own gate line | End of every phase |
| Independent review *(was `structural-code-review`)* | `/code-review` on the diff | End of every phase, before commit |
| Dashboard / approval UI verification *(was `frontend-visual-qa`)* | `verify` skill (Playwright MCP — **QA only**, ADR-001) | Phases 3.9, 9 |
| No self-certify; quality over speed *(was `AGENTS.md` rules)* | Enforced by the gate above: evidence before assertions | Always |

**One phase per context.** The plan is ~1,200 lines; loading it plus prior phases' code
crowds out the work. Gates exist so you can clear between them.

Tools load **only when relevant** — dynamic discovery, not an upfront dump.

---

## 20. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 22 + TypeScript | Async-native |
| API | Fastify | Lightweight, schema validation, async handlers |
| **Auth** | **WorkOS AuthKit** (ADR-002) | Orgs ↔ tenants; free to 1M MAU; SSO/SCIM when enterprise arrives |
| DB | PostgreSQL + Drizzle ORM | Multi-tenant relational data + RLS |
| Queue | BullMQ + Redis | Scheduled jobs, Tier-0 watch cron, background arm runs |
| **Workflows / HITL** | **Mastra** (Apache-2.0) — workflows + `suspend()`/`resume()` + durable state only | The approval inbox, already built. Arms stay plain TS. **Audit `ee/` gating before committing** |
| LLM | OpenRouter (routed per task) | Configurable tiers per arm |
| Image gen | **Gemini** (`@google/genai`) — "Nano Banana" is a nickname for these models, not a separate provider | §8.2; off by default |
| Search / intel | **Brave** (Tier 0) + **Tavily** (Tier 1); **not SerpAPI** — $25/mo floor exceeds the intel budget | §12.3 |
| Browser | **Playwright MCP (dev/QA only)** | Dashboard visual QA + demos; in-app publisher deferred (ADR-001) |
| UI | Vite + React | Approval inbox, calendar, settings, traces |
| Secrets | env + encrypted DB column (envelope: KEK → per-tenant DEK) | Credential vault; **no browser session storage** (ADR-001) |
| Observability | **Langfuse** (MIT core, Cloud) + thin `agent_traces` rollup | Tracing/evals bought, not built. **§6.1 caps stay in the harness — Langfuse has no per-tenant spend cap** |
| Dev / QA | Playwright MCP (Cursor) | Selector/debug demos; not multi-tenant runtime |

---

## 21. Platform adapters (v1 scope)

| Channel / platform | Copy pack | API arm (ready, off) | Browser arm |
|--------------------|-----------|----------------------|-------------|
| **Email** | ✓ (subject + body) | ✓ SMTP / SendGrid / Resend scaffold | N/A |
| Facebook | ✓ | ✓ Graph API scaffold | deferred (ADR-001) |
| X (Twitter) | ✓ | ✓ API v2 scaffold | deferred (ADR-001) |
| LinkedIn | ✓ | scaffold | deferred |
| Instagram | ✓ | scaffold (via FB) | deferred |

**Scaffold** = interface + credential schema + health check + stub that fails gracefully with "enable in settings". Activation is config + credentials only — no rewrite.

### Email compliance & deliverability (required before any send — R3)

Sending marketing email without this is a legal problem (CAN-SPAM / GDPR), not a feature gap:

| Requirement | Implementation |
|-------------|----------------|
| Consent-only lists | v1 sends only to tenant-provided lists with a `consent_confirmed` attestation checkbox; no purchased/scraped lists — refuse import without attestation |
| Unsubscribe | Working unsubscribe link injected into **every** email; one-click; processed within 10 days (CAN-SPAM) — target immediate |
| Suppression list | `email_suppressions` table per tenant: unsubscribes, hard bounces, spam complaints. **Publisher refuses to send to suppressed addresses** (harness gate, like risk levels) |
| Sender identity | Physical mailing address + accurate From/Reply-To in footer template (CAN-SPAM); tenant provides at email-enable time |
| Bounce/complaint handling | Webhooks (Task 8.3b) auto-add hard bounces + complaints to suppression |
| Authentication | Setup docs walk tenant through SPF, DKIM, DMARC before health check passes |
| GDPR | Unsubscribe = erasure request for marketing data; suppression survives list re-import |

### Adapter interface

```typescript
interface PlatformAdapter {
  platform: PlatformId;
  validateCredentials(creds: unknown): Promise<ValidationResult>;
  healthCheck(tenantId: string): Promise<HealthResult>;
  publishPost?(input: ApprovedPost): Promise<PublishResult>;
  replyToComment?(input: ApprovedReply): Promise<ReplyResult>;
  replyToMessage?(input: ApprovedReply): Promise<ReplyResult>; // DMs / inbox
}
```

---

## 22. API surface (control plane)

| Endpoint | Purpose |
|----------|---------|
| `POST /tenants` | Create workspace |
| `POST /tenants/:id/onboard` | Business profile intake |
| `POST /tenants/:id/jobs` | Enqueue single-arm job (async) |
| `POST /tenants/:id/campaign/run` | Full supervised pipeline: RESEARCH → STRATEGY → CREATION (stops at approval inbox) |
| `POST /tenants/:id/campaign/counter` | Start counter-campaign from `competitor_alert_id` |
| `GET /tenants/:id/competitor-alerts` | List detected rival campaigns |
| `POST /tenants/:id/competitor-alerts/:id/dismiss` | Dismiss / snooze alert |
| `GET /jobs/:id` | Poll job status + result |
| `GET /tenants/:id/traces` | List traces for tenant |
| `GET /traces/:id` | Trace detail |
| `GET /tenants/:id/events` | Activity feed (`system_events`, filterable) |
| `GET /tenants/:id/audit` | Compliance audit log |
| `POST /tenants/:id/strategy/generate` | Run strategy arm |
| `POST /tenants/:id/research/run` | Run full RESEARCH pillar (market + trend + competitor, parallel) |
| `POST /tenants/:id/intel/market` | Run market / SERP arm only |
| `POST /tenants/:id/intel/trends` | Run trend arm only |
| `POST /tenants/:id/intel/competitors` | Run competitor arm only |
| `POST /tenants/:id/content/recommend` | Generate social + email drafts + visual briefs (+ images if enabled) |
| `POST /tenants/:id/content/:draftId/regenerate-image` | Re-run Nano Banana for an approved-pending draft |
| `GET /tenants/:id/approvals` | Approval inbox |
| `POST /approvals/:id/decide` | approve \| edit \| reject |
| `POST /tenants/:id/daily-brief` | Trigger daily strategist |
| `GET /tenants/:id/calendar` | Schedule view |
| `POST /tenants/:id/published-items` | **Mark as published** (draft_id, platform, optional URL) — creates MEASURE anchor |
| `POST /tenants/:id/metrics/import` | Manual / CSV metrics import → `post_metrics` |
| `GET /tenants/:id/performance` | Metrics + KPI progress + angle scores |
| `POST /tenants/:id/analyst/run` | Run Analyst arm on demand |
| `GET /tenants/:id/insights` | Latest `performance_insights` |
| `PATCH /tenants/:id/platforms/:platform` | Toggle modes + flags |
| `POST /tenants/:id/platforms/:platform/credentials` | Save credentials |
| `POST /publish/:approvalId/execute` | Manual execute trigger |
| `POST /evals/run` | Run eval suite (CI / pre-deploy) |

---

## 23. Phased delivery

| Phase | Delivers | Gate |
|-------|----------|------|
| **0** | **Auth (WorkOS, Task 0.3a)**, scaffold, DB + RLS, tenant CRUD, feature flags, credential vault, trace shell, lazy tool registry, async job API, **per-tenant rate limit, health/readiness, backup/PITR** | Tests + migrate; **401 unauth / 403 non-member** |
| **0.5** | Model routing, memory, error taxonomy, risk assessor, **campaign pipeline on Mastra workflows + HITL suspend/resume** | Unit tests; **survives restart mid-suspend** |
| **1** | **RESEARCH** pillar: market/SERP + trend + competitor (+ **campaign watch**) + **hourly Tier-0 watch / Tier-1 analysis split (ADR-003)** | Intel with citations; alerts on campaign signals; **24 unchanged polls ⇒ zero LLM calls** |
| **2** | **STRATEGY** pillar: ICP, personas, angles/hooks, plan (+ **counter-angles** from alerts) | Strategy eval ≥ 90% |
| **3** | **CREATION** pillar: posts/campaign drafts + visuals + optional images + **UTM tagging + `published_items` anchor** | On-brand eval; counter-campaign drafts link to alert; mark-as-published works |
| **3.5** | **MEASURE** pillar: `post_metrics` + manual/CSV import, deterministic stats module, Analyst arm + weekly job, angle scoring, feedback wiring | Analyst eval: planted winner found + cited; no insight below sample threshold |
| **4** | **OPS** daily strategist (email + social priorities, consumes `performance_insights`) | Brief eval pass |
| **5** | **OPS** scheduler (email + social calendar) | Reminders + checkpoints |
| **6** | **OPS** engagement (comments + DMs) | HIGH risk gate for both |
| ~~7~~ | ~~Browser publisher~~ — **deferred post-v1 (ADR-001)** | — |
| **8** | **OPS** API adapters (social + email send, toggled off) + **email metrics webhooks → `post_metrics`** + **email compliance (suppression, unsubscribe)** | Credential wizard + compliance checks |
| **9** | Dashboard UI + observability (5-pillar navigation incl. Performance page) | `verify` skill |
| **10** | Eval CI + deploy hardening | Full suite ≥ 90% |

### Release plan (locked — solves v1 over-scope)

Phases are grouped into three releases. **Do not start a later release before the earlier one has real usage evidence.**

| Release | Contains | Scope guard | Exit criterion |
|---------|----------|-------------|----------------|
| **R1 — Validation slice** | Phases 0, 0.5, 1, 2, 3 (+3.8), 3.5 + **thin approval UI** (Task 3.9) | **One platform (Facebook) + email copy**, copy pack only, single tenant onboarded manually | A real tenant approves content weekly for 2+ consecutive weeks and says they'd pay |
| **R2 — Operations** | Phases 4, 5, 6, 9 (full dashboard), 10 (eval CI) | Add X (Twitter); still copy pack only | Daily brief + calendar + engagement in active use |
| **R3 — Automation (opt-in)** | Phase 8 (official API adapters + email send + webhooks) | Official APIs only; browser publish stays deferred (ADR-001) | Tenants explicitly request automation; compliance checklist green |

R1 answers the only question that matters first: **does the agent produce marketing output a real business wants to approve?** Everything in R2/R3 is worthless if R1's answer is no.

---

## 24. Out of scope for v1

- Paid ads API automation (flag reserved only)
- Auto-approve posts or replies
- Multi-user RBAC (single user per tenant OK for v1)
- Mobile app
- Real-time social listening at scale (batch intel runs only)
- Fully autonomous multi-agent debate loops (supervisor + arms is sufficient)

---

## 25. Defaults & configuration

| Setting | Default |
|---------|---------|
| UI vs CLI-first | Web dashboard primary; CLI for agent dev |
| Text (OpenRouter) | Fast / balanced / deep tiers per §6 |
| Image gen | Off; Nano Banana / Gemini via `ImageAdapter` when `image_gen_enabled` |
| Image variants | Default **1** per draft; max 3 (≥2 needs tenant opt-in — ~$0.13/image, §6.1) |
| Intel refresh | **Hourly Tier-0 watch (no LLM); Tier-1 analysis on detected change; 24h max staleness** (§12.3) |
| Max drafts per day | 5 per platform (configurable) |
| Max arm steps | 10 per ReAct loop; hard stop |
| Retry cap | 2 per transient error |
| Eval deploy gate | ≥ 90% pass rate on golden fixtures |
| Context compaction | After 20 turns in short-term buffer |
| Analyst cadence | Weekly per tenant + on-demand after metrics import |
| Min sample for insights | 5 published items per angle/format; below → `provisional`, excluded from prompts |
| Metrics ingestion | Manual/CSV in v1; email webhooks Phase 8; own-page Graph API post-v1 |
| UTM tagging | Always on: `utm_campaign=campaign_id`, `utm_content=draft_id` |

---

## 26. References

- [The Anatomy of an Agent Harness](https://blog.dailydoseofds.com/p/the-anatomy-of-an-agent-harness) — 11 harness components, permission separation, verification
- [Agentic AI Engineer Roadmap](https://youmind.com/landing/x-viral-articles/agentic-ai-engineer-roadmap-guide) — async, HITL, evals, tracing, production deploy
- [Min(Input) → Max(Output)](https://ahmedhesham.dev/blog/min-input-max-output/) — reachable vs active context
- Veeza computer-use talk — gate irreversible actions, checkpoint long flows
- Playwright MCP — dev/QA flow verification only (in-app publisher deferred, ADR-001)
- Completion gate — §19

---

## 27. Approval

Review this spec. When approved, implementation follows `implementation-plan.md` one phase per context, using the completion gate (§19). Ready-made prompt: `docs/phase-prompt.md`.

# AdWasta — Supervised Crew

Multi-tenant marketing AI: a **supervisor Brain** + specialist **crews** (not one mega-prompt, not chatty agents).

```
Human idea → Brain (supervisor) → RESEARCH crew → STRATEGY crew → CREATION crew
           → Human approval → OPS crew (schedule · engage · publish)
```

## Why Supervised Crew?

| Approach | Verdict |
|----------|---------|
| Single agent does everything | ❌ Generic output, context rot |
| Chatty multi-agent crew | ❌ Handoff failures, token explosion |
| **Supervised crew + typed handoffs** | ✅ **Best practice — what we build** |

## Specialist roster

| Persona | Crew | Pillar |
|---------|------|--------|
| **Alex** | Market, Trend, Competitor (parallel) + campaign watch | RESEARCH |
| **Sam** | ICP, Personas, Angles, Plan (+ counter-campaign) | STRATEGY |
| **Jordan** | Posts/campaigns + visual briefs (+ Nano Banana when enabled) | CREATION |
| **Ops** | Daily brief, Schedule, Engagement (comments + DMs), Publish | OPS |
| **Riley** | Performance insights from metrics (deterministic stats + analysis) | MEASURE |

## Five pillars

```
RESEARCH          STRATEGY           CREATION           OPS          MEASURE
Market / SERP     ICP / Personas     Copywriting        Email        Metrics
Competitors       Angles / Hooks     Visuals + images   Social       Insights
                                     (Nano Banana opt.)              ↺ feeds Strategy
```

## Publish modes (per tenant, per platform)

| Mode | Default | Description |
|------|---------|-------------|
| `copy_pack` | On | Ready-to-paste; zero account risk; works everywhere |
| `api` | Off | Official platform APIs; toggle + credentials; no rewrite to activate |
| `browser` | — | **Deferred post-v1** (ADR-001 — ToS + account-risk; see design §10.0) |
| `image_gen` | Off | Nano Banana / Gemini images for posts (Jordan writes prompt) |

## Docs

| Document | Purpose |
|----------|---------|
| [docs/design.md](./docs/design.md) | v3.1 — Supervised Crew, five pillars (incl. MEASURE), harness, evals, locked decisions |
| [docs/implementation-plan.md](./docs/implementation-plan.md) | Phased build (Phase 0–10) |

## Principles

- **Zero account risk first** — copy pack default; official APIs opt-in; no ToS-violating automation (ADR-001)
- **Harness is the product** — traces, evals, permissions, checkpoints
- **Human keeps judgment** — approve before publish/reply/send
- **Closed loop** — metrics feed insights; insights feed the next strategy and content round
- **ship-loop** — gate every implementation phase
- **Min(Input)→Max(Output)** — minimum context per specialist

## Docker (local & publish)

```bash
cd marketing-agent
cp .env.example .env   # add OPENROUTER_API_KEY, CREDENTIALS_MASTER_KEY
docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:8080 | Control plane UI (placeholder → full dashboard Phase 9) |
| http://localhost:3001/health | API |

See [docs/docker.md](./docs/docker.md) for production compose.

## Control plane UI

**Yes** — a web dashboard lets you and each **customer (tenant)** turn features on/off, manage credentials, approve content, and run campaigns. See [docs/design.md §1.4](./docs/design.md) for pages and toggles.

## Quick start (without Docker)

```bash
cd marketing-agent
cp .env.example .env
npm install
npm run dev
```

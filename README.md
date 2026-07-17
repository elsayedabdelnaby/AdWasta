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

## Four pillars

```
RESEARCH          STRATEGY           CREATION           OPS
Market / SERP     ICP / Personas     Copywriting        Email
Competitors       Angles / Hooks     Visuals + images   Social
                                     (Nano Banana opt.)
```

## Publish modes (per tenant, per platform)

| Mode | Default | Description |
|------|---------|-------------|
| `copy_pack` | On | Ready-to-paste; best organic reach |
| `browser` | Off | Playwright in native UI (armed per post) |
| `api` | Off | Toggle + credentials; no rewrite to activate |
| `image_gen` | Off | Nano Banana / Gemini images for posts (Jordan writes prompt) |

## Docs

| Document | Purpose |
|----------|---------|
| [docs/design.md](./docs/design.md) | v3 — Supervised Crew, harness, evals, locked decisions |
| [docs/implementation-plan.md](./docs/implementation-plan.md) | Phased build (Phase 0–10) |

## Principles

- **Harness is the product** — traces, evals, permissions, checkpoints
- **Human keeps judgment** — approve before publish/reply/send
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

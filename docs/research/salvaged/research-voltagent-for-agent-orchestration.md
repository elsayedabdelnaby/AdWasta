# Research VoltAgent for agent orchestration

# VoltAgent (github.com/VoltAgent/voltagent) — Build vs. Buy Research

**License**: MIT. Root file is named `LICENCE` (British spelling — that's why `/LICENSE` 404s). Full text: *"MIT License / Copyright (c) 2025 VoltAgent Inc."* — verified via [github.com/repos/VoltAgent/voltagent/license API](https://api.github.com/repos/VoltAgent/voltagent/license) and confirmed in repo metadata. Note the copyright holder is "VoltAgent Inc.," i.e., a registered company, not an individual.

**Stars**: 10,075 stars, 1,050 forks, 90 watchers, 69 open issues (github.com/VoltAgent/voltagent, live API pull). **Last commit**: 2026-07-13. **Last release**: `@voltagent/core@2.9.0`, published 2026-07-08 ([releases](https://github.com/VoltAgent/voltagent/releases)). 1,744 total commits on `main`, 698 releases (monorepo/changesets-heavy). npm version history: `0.1.0` (2025-04-18) → `1.0.0` (2025-09-12) → `2.0.0` (2025-12-30) → `2.9.0` current, plus a `3.0.0-next.0/1` prerelease already cut ([registry.npmjs.org/@voltagent/core](https://registry.npmjs.org/@voltagent/core)). **Not** stuck on 0.x — versioning moves fast (arguably too fast for "stable").

**TS-native**: Yes — 95.4% TypeScript by GitHub language stats.

**Supervisor/Handoff — YES, real API**: [voltagent.dev/docs/agents/sub-agents](https://voltagent.dev/docs/agents/sub-agents/). `subAgents: [agentA, agentB]` on a supervisor `Agent`; supervisor auto-gets a `delegate_task` tool; `createSubagent({ agent, method: "generateObject", schema })` gives typed/schema-validated handoffs.

**HITL interrupt — YES, real API, close match to your need**: [voltagent.dev/docs/workflows/suspend-resume](https://voltagent.dev/docs/workflows/suspend-resume/). `await suspend(reason, data)` pauses a workflow step; `execution.resume(data)` continues it; `suspendSchema`/`resumeSchema` type both ends. Docs literally use a document-approval example (`reviewerId`, `approved`).

**Durable/resumable state — YES (DIY, config-driven)**: Agent memory has 6 adapters — InMemory (dev-only), LibSQL, Postgres, Supabase, Cloudflare D1, hosted "Managed Memory" ([docs/agents/memory/overview](https://voltagent.dev/docs/agents/memory/overview/)). Workflows have a separate `workflowMemory` option using the same adapters for suspend/resume checkpoints ([docs/workflows/overview](https://voltagent.dev/docs/workflows/overview/)) — docs don't explicitly state crash-durability guarantees, only that persistent backends exist.

**Maturity**: repo created 2025-04-16 (~15 months old); ~71 contributors, but 2 people (omeraplak: 861 commits, necatiozmen: 404) plus a bot account account for the large majority of 1,744 commits — concentrated core team, not broad community-driven. npm downloads: 12,505/week, 53,320/month. Real named case studies with quotes exist ([voltagent.dev/customers](https://voltagent.dev/customers/)): Joggr, MagicSchool AI, Service Hero Marketing (450+ SMB clients). No funding announcement found (not ruled out, just unverified — WebSearch budget exhausted this session).

**Verdict**: Small-team-led (VoltAgent Inc.) but genuinely shipping fast with real API surface for exactly your use case (supervisor handoffs, suspend/resume HITL, pluggable durable storage) and a few credible production adopters — closer to "credible early-stage vendor" than "toy repo," but still far short of "battle-tested at scale"; the 2-person commit concentration and rapid major-version churn (0→1→2→3-next in 15 months) are real bus-factor and API-stability risks to weigh against build.

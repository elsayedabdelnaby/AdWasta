# Research Mastra for agent orchestration

## Mastra Research Report

**License** — Dual/open-core. Core framework: **Apache License 2.0** (copyright "Kepler Software, Inc.," Mastra's legal entity). Code under any `ee/` directory: separate "Mastra Enterprise Edition (EE) License" — source-available but forbids production use without a paid agreement ("you may not use this Software in production unless you... have entered into... a written agreement with Kepler"; free only for dev/test). Not Elastic License 2.0 — it's Apache-2.0 + a bespoke EE license, an open-core model.
Sources: https://raw.githubusercontent.com/mastra-ai/mastra/main/LICENSE.md , https://raw.githubusercontent.com/mastra-ai/mastra/main/ee/LICENSE

**Stars** — ~26.3k (github.com/mastra-ai/mastra, fetched live).

**Last release** — `@mastra/core@1.51.0`, July 15, 2026 (confirmed both on GitHub releases and via `registry.npmjs.org/@mastra/core`, which also shows 1,396 published versions since first release 0.1.0 on 2024-10-02 — no longer 0.x). https://github.com/mastra-ai/mastra/releases

**TS-native / founders** — Confirmed ex-Gatsby team: Sam Bhagwat (CEO, Gatsby.js cofounder, sold to Netlify), Abhi Aiyer (CTO, led Gatsby Cloud engineering), Shane Thomas (CPO, Gatsby staff engineer). Built Oct 2024. https://mastra.ai/about , https://www.ycombinator.com/companies/mastra

**Supervisor/handoff — YES.** `mastra.ai/docs/agents/supervisor-agents.md`: a supervisor `Agent` takes an `agents: {researchAgent, writingAgent}` map; delegation is dispatched as typed tool calls based on each subagent's `description`. Also see `.network()` and A2A docs. https://mastra.ai/docs/agents/supervisor-agents.md

**HITL suspend/resume — YES, first-class primitive.** Step-level: `execute: async ({resumeData, suspend}) => { if(!resumeData?.approved) return await suspend({reason:...}) }`, with `suspendSchema`/`resumeSchema` on `createStep`. Resume: `await run.resume({step: 'step-1', resumeData: {approved: true}})`. Also `bail()` for explicit rejection. https://mastra.ai/docs/workflows/human-in-the-loop.md , https://mastra.ai/reference/workflows/run-methods/resume.md

**Durable/resumable state — YES.** 12 storage adapters incl. LibSQL, Postgres, MongoDB, Upstash, Redis, Cloudflare D1/KV, DynamoDB, MSSQL, Spanner. Doc quote: storage "keeps memory, workflow state... long-running agent state available after a process restarts"; in-memory default explicitly "loses data when the process exits." https://mastra.ai/docs/server-db/storage

**Funding/traction** — $13M seed (YC, PG, Gradient) + $22M Series A (Spark Capital) = $35M total. ~1.15M weekly npm downloads (npm API). Named users on vendor page (self-reported, not independent case studies): Sanity, Replit, SoftBank, WorkOS, Docker, Elastic, PLAID. https://mastra.ai/blog/seed-round , https://mastra.ai/blog/series-a , https://mastra.ai/customers

**Verdict**: Fast-moving, well-funded, genuinely feature-complete (real suspend/resume + durable storage + supervisor pattern), version 1.51 with heavy npm traction — beyond hobby-project stage, but the EE license gates some production features and the customer list is vendor-curated rather than independently audited.

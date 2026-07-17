# Research LangGraph.js for agent orchestration

# LangGraph.js Research — Build-vs-Buy Section

**License (+ LangSmith note).** LangGraph.js is MIT licensed. The `LICENSE` file at the repo root reads: "The MIT License / Copyright (c) 2024 LangChain / Permission is hereby granted, free of charge..." — https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE. LangSmith (LangChain's observability/tracing/deployment platform) is a **separate commercial product**, not required to run LangGraph. LangChain's pricing page lists "Open Source Frameworks" (langgraph, langchain, deepagents) as a distinct category from the paid LangSmith Platform (Developer free tier w/ 5k traces, Plus $39/seat/mo, Enterprise custom/self-hosted) — https://www.langchain.com/pricing. LangGraph runs fully standalone with its own checkpointers; LangSmith is optional.

**Stars.** 3,120 (~3.1k) via GitHub API, license field confirms "MIT License" — https://github.com/langchain-ai/langgraphjs (repo API-verified).

**Last release.** `@langchain/langgraph@1.4.8`, published 2026-07-15 (two days before this research) — https://github.com/langchain-ai/langgraphjs/releases and npm registry (`registry.npmjs.org/@langchain/langgraph`). Active weekly release cadence across the monorepo.

**TS-native/parity.** Mostly at parity but with a real lag tail. Open issue #1767 (Nov 2025): `createAgent` can't be used as a StateGraph node in JS (works in Python) — https://github.com/langchain-ai/langgraphjs/issues/1767. Closed issue #2499 shows supervisor-to-agent handoff-message parity had to be added after the fact. Closed issue #759 tracked JS missing auth/access-control that Python had (resolved Jun 2025). Verdict: JS trails Python by weeks-to-months on new features, not fundamentally crippled.

**Supervisor/Handoff — YES.** Dedicated `@langchain/langgraph-supervisor` package: `createSupervisor({ agents, llm, prompt })` returns a `StateGraph`; agents built via `createReactAgent`; tool-based handoff with `outputMode: "full_history"|"last_message"` — https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor.

**HITL interrupt — YES.** `interrupt(value)` pauses the node; resume via `new Command({ resume: value })`; node restarts from its beginning on resume — https://docs.langchain.com/oss/javascript/langgraph/interrupts.

**Durable/resumable state — YES.** Checkpointers: `MemorySaver` (RAM), `SqliteSaver` (local file), `PostgresSaver`/`AsyncPostgresSaver` (Postgres), keyed by `thread_id` in config — https://docs.langchain.com/oss/javascript/langgraph/persistence.

**Production-readiness verdict.** Genuinely production-used (2.67M npm weekly downloads for `@langchain/langgraph`; Replit/Uber/LinkedIn/GitLab cited) but the dedicated supervisor helper is niche (22k weekly downloads) and community mindshare (3.1k stars) trails Python — treat JS as capable-but-second-tier, verify any specific feature against Python docs before relying on it.

# Research Vercel AI SDK for agent orchestration

## Vercel AI SDK — Build vs. Buy Findings

**License:** Apache License 2.0, Copyright 2023 Vercel, Inc. Confirmed by fetching the raw file directly — full text at [github.com/vercel/ai/blob/main/LICENSE](https://github.com/vercel/ai/blob/main/LICENSE), and `packages/ai/package.json` sets `"license": "Apache-2.0"` explicitly.

**Stars / Activity:** 25,608 stars, 4,791 forks, 1,710 open issues (GitHub API, [github.com/vercel/ai](https://github.com/vercel/ai), queried 2026-07-17). **Last release:** `ai@7.0.31` published 2026-07-17T11:56:46Z — same day as query ([registry.npmjs.org/ai](https://registry.npmjs.org/ai), [github.com/vercel/ai/releases](https://github.com/vercel/ai/releases)). Release cadence is near-continuous (multiple package releases per day).

**TS-native:** Yes. Billed as "The AI Toolkit for TypeScript," built on Zod schemas end-to-end with generic type inference (`InferAgentUIMessage`, `InferWorkflowAgentUIMessage`) — [github.com/vercel/ai](https://github.com/vercel/ai).

**Agent primitives:** Real, not just chat hooks. `ToolLoopAgent` (core `ai` package) wraps `generateText`/`streamText`'s tool-calling loop with `stopWhen`/`isStepCount`/`isLoopFinished`, typed tools via `tool()`, and `result.steps` — [content/docs/03-agents/01-overview.mdx](https://github.com/vercel/ai/blob/main/content/docs/03-agents/01-overview.mdx).

**Supervisor/handoff — DIY, not first-class.** The "Subagents" doc is explicit: "A subagent is an agent that a parent agent can invoke. The parent delegates work **via a tool**" — it's tool-calling wrapping another agent instance, no dedicated handoff class. Confirmed also: "Subagent tools cannot use `toolApproval`" ([06-subagents.mdx](https://github.com/vercel/ai/blob/main/content/docs/03-agents/06-subagents.mdx)). Orchestrator-worker patterns are likewise hand-rolled with `Promise.all()`.

**HITL interrupt — nuanced yes, mostly DIY-adjacent.** `toolApproval`/`needsApproval` is a real, documented primitive, but for base `generateText`/`streamText`/`ToolLoopAgent`, the docs state plainly: **"don't pause execution... complete and return `tool-approval-request` parts"** — you must make a *second synchronous call* with the approval added to messages ([06-tool-approvals.mdx](https://github.com/vercel/ai/blob/main/content/docs/03-agents/06-tool-approvals.mdx)). True cross-restart suspend/resume only exists via the separate `@ai-sdk/workflow` package's `WorkflowAgent`, where the workflow genuinely suspends and "the user can approve hours later" ([07-workflow-agent.mdx](https://github.com/vercel/ai/blob/main/content/docs/03-agents/07-workflow-agent.mdx)).

**Durable/resumable state — DIY unless you adopt Vercel's separate Workflow runtime.** Docs admit plainly: "A standard `ToolLoopAgent` runs entirely in memory — if the process crashes, all progress is lost." Durability requires `@ai-sdk/workflow` (created 2026-04-02, now v1.0.31, only **38,918** weekly downloads vs. **16.16M**/week for base `ai` — [npmjs.org downloads API](https://api.npmjs.org/downloads/point/last-week/ai)), which depends on Vercel's proprietary `workflow` package (`'use workflow'`, `getWritable()`) — i.e., coupling to Vercel's own runtime, not a portable primitive.

**Verdict:** Massively adopted as a streaming/chat-UI and LLM-call abstraction; its "Brain"-grade orchestrator features (typed handoff, durable HITL) are recent, thin wrappers over tool-calling, and the only truly durable path locks you into Vercel's separate Workflow runtime.

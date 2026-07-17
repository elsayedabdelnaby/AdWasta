# Research Trigger.dev for build-vs-buy report

I have gathered all findings from primary sources. Here is the report:

---

## Trigger.dev — Build-vs-Buy Assessment (Durable Execution for Playwright Browser Publishing)

### 1. License

The root of the monorepo is licensed **Apache License, Version 2.0** — confirmed by fetching the raw file (github.com/triggerdotdev/trigger.dev/blob/main/LICENSE). This covers the self-hosted webapp/orchestrator (`apps/webapp` has no separate LICENSE, so it inherits the root Apache-2.0).

The publishable SDK/client packages carry their own, more permissive **MIT License**: `packages/trigger-sdk/LICENSE`, `packages/core/LICENSE`, `packages/cli-v3/LICENSE`, `packages/build/LICENSE`, `packages/python/LICENSE`, and `internal-packages/otlp-importer/LICENSE` are all MIT (Copyright Trigger.dev), verified via the GitHub Contents API.

History (via `gh api .../commits?path=LICENSE`): the project briefly used a "dual license" model at inception (Jan 2023), moved to Apache-2.0 in June 2023, then added MIT to the public packages in Aug 2023 — stable since. No BSL/FSL/fair-source field-of-use restriction exists today; I found no `ee/`/enterprise-gated directory in the tree. Net: self-hosting is unrestricted OSS, no competing-use clause.

### 2. Self-host vs. cloud

Self-hosting docs (trigger.dev/docs/open-source-self-hosting) describe two containers: a **webapp** container (dashboard + Postgres + Redis) and a **worker** container (supervisor + task runners), deployable via Docker Compose or Kubernetes. The docs place all "security, uptime, and data integrity" responsibility on the self-hoster and explicitly warn to pin version tags to your CLI version. The page does not surface a ClickHouse or S3 requirement on the overview level (may exist in the detailed compose/k8s guides, not confirmed here).

Cloud pricing (trigger.dev/pricing): **Free** ($0, $5 credits/mo, 20 concurrent runs, 1-day log retention), **Hobby** ($10/mo, $10 credits, 50 concurrent, 7-day retention), **Pro** ($50/mo, $50 credits, 200+ concurrent runs with $10/mo per +50, seats at $20/mo each), **Enterprise** (custom). Usage is metered per-second of compute (e.g., Micro machine ≈ $0.0000169/sec) plus $0.25 per 10,000 run invocations.

### 3. Durable execution / step-resume — the critical nuance

Docs (trigger.dev/docs/tasks/overview, .../wait, .../queue-concurrency) confirm retries, `wait.for()`/`wait.until()`/`wait.forToken()`, and "waitpoints." Checkpointing is real but **coarse-grained**: a run is checkpointed (frees its concurrency slot, stops compute billing) only at a waitpoint — i.e., when it calls `triggerAndWait` on a subtask, or `wait.for`/`wait.until` beyond ~5 seconds. Crucially, when a `run()` function throws mid-execution, the docs state a task "is retried" (default 3 attempts) but do **not** describe per-line/per-step resume within a single run — I could not find any documentation claiming a failed run resumes from the exact statement it crashed on. The only genuine "resume from here" durability comes from decomposing work into separate **subtasks** invoked via `triggerAndWait`, each of which is its own checkpointed, independently-retried run. A monolithic multi-step function is not automatically step-resumable; you must architect the step boundaries yourself as task/subtask calls.

No case studies for browser automation were found in the changelog (trigger.dev/changelog).

### 4. TypeScript-nativeness

Fully function-based, no decorators: `import { task } from "@trigger.dev/sdk/v3"; export const myTask = task({ id: "...", run: async (payload) => {...} })` (trigger.dev/docs/tasks/overview). Lifecycle hooks (`onStart`, `onSuccess`, `onFailure`, `onWait`, `onResume`, `middleware`, `onCancel`, `catchError`) are configuration-object properties, not decorators.

### 5. Verdict for the Playwright browser-publisher use case

**There is an official Playwright build extension** (`packages/build/src/extensions/playwright.ts`, docs at trigger.dev/docs/config/extensions/playwright) — but reading its source confirms it only **installs Playwright browser binaries and Debian system deps into the Docker build image**. It is a build-time convenience, not a runtime durability feature ("only affects the build and deploy process, not the `dev` command").

The Playwright docs page itself is explicit about the real limitation: to survive waits/resumes, you must wire your own `middleware` + `onWait` + `onResume` hooks, and the documented pattern **closes the browser at `onWait` and launches a brand-new browser instance at `onResume`**, then manually re-navigates. This directly confirms the suspicion in the brief: the workflow engine cannot serialize or pause a live Chromium process/CDP connection. A checkpoint captures the JS execution point at a waitpoint, not attached OS resources like an open browser — the engine's own recommended pattern requires the developer to persist "what step/URL/state was I at" and rebuild the browser session from there.

**Conclusion**: Trigger.dev is a genuinely open-source (Apache-2.0/MIT), well-documented TypeScript-native durable-task platform, but it is oriented toward orchestrating *idempotent, restartable units of work* (API calls, LLM steps, subtask fan-out) — not toward pausing/resuming a stateful in-process resource like a live browser page. For the Playwright social-publisher flow specifically, adopting it would not eliminate the need to hand-roll "last completed step/URL" persistence — you'd still architect that yourself, just inside Trigger.dev's `onWait`/`onResume` hooks instead of inside BullMQ job data. The net win over BullMQ+Redis would be at-boundary crash recovery, retry/backoff ergonomics, and observability (dashboards, realtime logs) — not a free "resume mid-click" capability. Given AdWasta already runs BullMQ+Redis, introducing Trigger.dev purely for this one flow adds an entire second infra dependency (Postgres+Redis+their orchestrator) for a durability guarantee that is coarser than the requirement (step-N resume) actually demands; the same "last completed step" checkpoint pattern can be implemented directly in the existing BullMQ job with less operational surface area.

**Sources**: 
https://github.com/triggerdotdev/trigger.dev/blob/main/LICENSE ,
https://github.com/triggerdotdev/trigger.dev/blob/main/packages/trigger-sdk/LICENSE ,
https://github.com/triggerdotdev/trigger.dev/blob/main/packages/core/LICENSE ,
https://github.com/triggerdotdev/trigger.dev/commits/main/LICENSE ,
https://trigger.dev/pricing ,
https://trigger.dev/docs/open-source-self-hosting ,
https://trigger.dev/docs/tasks/overview ,
https://trigger.dev/docs/wait ,
https://trigger.dev/docs/queue-concurrency ,
https://trigger.dev/docs/triggering ,
https://trigger.dev/docs/config/extensions/playwright ,
https://github.com/triggerdotdev/trigger.dev/blob/main/packages/build/src/extensions/playwright.ts ,
https://trigger.dev/changelog

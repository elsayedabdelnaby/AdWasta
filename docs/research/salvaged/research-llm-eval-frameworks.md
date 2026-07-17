# Research LLM eval frameworks

## LLM Evaluation Frameworks — Build vs. Buy Research (Section)

### 1. Promptfoo

- **License:** MIT, confirmed on the repo itself.[github.com/promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)
- **Stars:** ~23.4k.[github.com/promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)
- **Last release:** v0.121.19, July 14, 2026.[github.com/promptfoo/promptfoo/releases](https://github.com/promptfoo/promptfoo/releases)
- **Stack:** genuinely TypeScript-native — repo language breakdown is TypeScript 97.2%, with CSS/JS/Python as minor slivers (docs site, scripts).[github.com/promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)
- **CI-friendliness:** Yes. The CLI supports a `--fail-on-error` flag to "fail the build when quality thresholds aren't met," ships a documented GitHub Actions workflow, and a marketplace action (`promptfoo/promptfoo-action@v1`).[promptfoo.dev/docs/integrations/ci-cd](https://www.promptfoo.dev/docs/integrations/ci-cd/) It supports custom graders/LLM-as-judge providers and custom assertions natively.
- **Library usage — verified, not assumed:** Promptfoo has a documented Node.js package API separate from the CLI+YAML path. You `import promptfoo from 'promptfoo'` and call `const evalRecord = await promptfoo.evaluate(testSuite, options)` directly in-process, with providers, prompts, transforms, and assertions all definable as plain JS/TS functions (e.g., `assert: [{ type: 'javascript', value: (output, context) => ({ pass, score, reason }) }]`) instead of YAML strings.[promptfoo.dev/docs/usage/node-package](https://www.promptfoo.dev/docs/usage/node-package/) [promptfoo.dev/docs/usage/node-api-reference](https://www.promptfoo.dev/docs/usage/node-api-reference/)
- **Verdict:** Confirmed as the strongest TS-native fit — MIT, actively released, real CI exit-code gating, and a genuine importable library API (not CLI-only).

### 2. DeepEval

- **License:** Apache-2.0.[github.com/confident-ai/deepeval](https://github.com/confident-ai/deepeval)
- **Stars:** ~16–17k (sources vary: search snapshot showed 14k+, direct repo fetch showed ~16.9k — likely just different fetch times).[github.com/confident-ai/deepeval](https://github.com/confident-ai/deepeval)
- **Last release:** 4.1.0, July 12, 2026.[github.com/confident-ai/deepeval/releases](https://github.com/confident-ai/deepeval/releases)
- **Stack:** Python-native — 86.8% Python, `pip install -U deepeval`, requires Python ≥3.9; pytest-style `deepeval test run test_chatbot.py` runner for CI gating with pass/fail thresholds.[github.com/confident-ai/deepeval/blob/main/README.md](https://github.com/confident-ai/deepeval/blob/main/README.md)
- **TS mismatch flag:** There is a `deepeval-ts` npm package, but it's explicitly a thin **client wrapper to the Confident AI cloud API** (tracing/session analytics), not a local Node-native eval engine — local metric computation still runs in Python, and the JS package requires a Confident AI account/API key.[deepeval.com/blog/typescript-in-deepeval-monorepo](https://deepeval.com/blog/typescript-in-deepeval-monorepo) [npmjs.com/package/deepeval-ts](https://www.npmjs.com/package/deepeval-ts)
- **Verdict:** Real friction for AdWasta — adopting DeepEval's core evaluation logic means shelling out to a Python subprocess/service from the Fastify backend, or depending on Confident AI's cloud for the TS path. Clear mismatch for a TS-only stack.

### 3. Langfuse Evals

- **License:** MIT for the whole repo **except** the `ee/`, `web/src/ee/`, and `worker/src/ee/` directories, which are under a separate `ee/LICENSE`.[github.com/langfuse/langfuse LICENSE](https://raw.githubusercontent.com/langfuse/langfuse/main/LICENSE)
- **Stars:** ~31.3k.[github.com/langfuse/langfuse](https://github.com/langfuse/langfuse)
- **Last release:** v3.219.0, July 17, 2026.[github.com/langfuse/langfuse](https://github.com/langfuse/langfuse)
- **Stack:** TypeScript-native (98.7%).[github.com/langfuse/langfuse](https://github.com/langfuse/langfuse)
- **Eval features:** LLM-as-a-judge scoring on traces/observations/experiments, dataset-based experiments, and an explicit "CI/CD experiments" feature to "block deploys on regressions."[langfuse.com/docs/evaluation/overview](https://langfuse.com/docs/evaluation/overview) [langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- **Open vs. enterprise:** Pricing page confirms "Langfuse is open source and you can self-host it for free," and LLM-as-judge/datasets/experiments appear across cloud tiers.[langfuse.com/pricing](https://langfuse.com/pricing) I could not find explicit text confirming the CI/CD-experiments feature specifically lives outside `ee/`, but since eval/dataset code isn't called out as `ee/`-scoped in the LICENSE, core eval capability is reasonably (not 100%) confidently open/self-hostable.
- **Caveat:** Langfuse is a full observability *platform* (Postgres/ClickHouse/Redis stack, or a cloud account) that you query via SDK/API for eval results — it's not a lightweight CLI dependency you `npm install` into a CI job the way Promptfoo is.
- **Verdict:** Genuine TS-native LLM-as-judge + regression gating, but architecturally heavy for a narrow ship-loop gate; more relevant if AdWasta also wants full production tracing (the tracing side is covered by another researcher).

### 4. Braintrust

- **License/self-host:** The core platform is proprietary SaaS. Self-hosting is only offered as an Enterprise "hybrid deployment" (data plane in the customer's VPC, control plane/UI/auth still hosted by Braintrust) — corroborated by a third party (MLflow's comparison page calling it "closed-source commercial SaaS").[braintrust.dev/articles/best-self-hosted-ai-evals-tools-2026](https://www.braintrust.dev/articles/best-self-hosted-ai-evals-tools-2026) [mlflow.org/braintrust-alternative](https://mlflow.org/braintrust-alternative/)
- **TS/JS SDK:** `braintrust-sdk-javascript` is Apache-2.0, genuinely open-source client tooling.[github.com/braintrustdata/braintrust-sdk](https://github.com/braintrustdata/braintrust-sdk)
- **Pricing:** Free "Starter" tier ($0/mo, $10 credit, 1GB processed data, 10k scores/month before overage), Pro $249/mo, Enterprise custom.[braintrust.dev/pricing](https://www.braintrust.dev/pricing)
- **Evals features:** `Eval()` function, LLM-as-judge scorers, experiments as an "immutable, comparable record of eval runs" for regression tracking, and an explicit "run in CI/CD to catch regressions automatically" guide.[braintrust.dev/docs/guides/evals](https://www.braintrust.dev/docs/guides/evals) [braintrust.dev/docs/reference/libs/nodejs](https://www.braintrust.dev/docs/reference/libs/nodejs)
- **Verdict:** High-quality, first-class TS SDK and a CI-gating-ready evals API, but the backend is a metered proprietary SaaS (capped free tier, no non-enterprise self-host) — adopting it means an external vendor/data dependency for something that should be a cheap, frequent CI step.

### Comparison table

| Tool | License | Stars | Last release | Stack | TS-native | CI gating | Library/importable | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Promptfoo** | MIT | ~23k | v0.121.19 (Jul 14, 2026) | TS 97% | Yes | Exit codes + GH Action | **Yes** — `import promptfoo; promptfoo.evaluate()` | Best TS-native fit, CLI or library |
| **DeepEval** | Apache-2.0 | ~16–17k | 4.1.0 (Jul 12, 2026) | Python 87% (+thin TS cloud client) | No | pytest-style (`deepeval test run`) | Python only; TS = cloud API client | Mismatch — needs Python runtime |
| **Langfuse (evals)** | MIT core / separate license for `ee/` | ~31k | v3.219.0 (Jul 17, 2026) | TS 99% | Yes | Via platform + SDK ("block deploys") | SDK yes, but needs a full Langfuse server/stack | Strong features, heavy footprint |
| **Braintrust** | Proprietary SaaS core; JS/TS SDK is Apache-2.0 | N/A (closed) | Active SDK releases | TS SDK native | Yes (SDK) | Yes, built for it | Yes, first-class TS SDK | Great SDK, vendor-dependent backend |

### Recommendation

For AdWasta's TS-only Fastify backend, **Promptfoo is the clear pick** if any existing framework is adopted for the ship-loop's eval-gate step — this was verified rather than assumed: it's MIT-licensed, 97% TypeScript, actively released within days of today, has real CLI exit-code gating for CI, and — critically — exposes a genuine **programmatic Node.js API** (`promptfoo.evaluate(testSuite, options)`) with JS-native custom assertions and providers, so it can be `import`ed and called in-process from the ship-loop gate rather than shelled out to as an external CLI or a hosted server. That directly satisfies the "invoke it programmatically" requirement.

**DeepEval** should be ruled out for AdWasta specifically because of the Python mismatch: its core evaluation engine is Python, and its TS story (`deepeval-ts`) is a thin client to Confident AI's cloud rather than a local Node eval engine — adopting it would mean maintaining a Python subprocess/service alongside the Node backend for no clear benefit over Promptfoo.

**Langfuse evals** and **Braintrust** are both legitimate TS-native eval products with real LLM-as-judge and regression-gating capability, but both require standing up (or paying for) an external platform — a self-hosted DB stack/cloud account for Langfuse, a metered proprietary SaaS for Braintrust — which is more operational/vendor surface than a "few hundred assertions gating a deploy" needs. They're worth revisiting later if AdWasta wants full production trace-level monitoring (Langfuse) or a managed evals dashboard (Braintrust), but not as the core of the ship-loop CI gate.

**Bottom line:** don't keep building a fully bespoke eval runner from scratch — adopt **Promptfoo as a library dependency** inside the ship-loop's verify step (custom JS assertions for deterministic rule checks, provider-based LLM-as-judge graders, `evaluate()` called in-process), which gets battle-tested test-suite semantics, caching, and CI exit-code conventions "for free" while remaining just as programmatically invokable as a hand-rolled runner.

*Note on methodology:* Star counts and release dates are point-in-time snapshots (fetched July 2026); WebSearch quota was exhausted mid-research, so the last two Braintrust checks (pricing tier details, evals guide) relied on direct WebFetch of primary source pages rather than cross-search corroboration — flagged above where a claim rests on Braintrust's own marketing rather than a third party.

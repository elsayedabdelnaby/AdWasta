# Research Langfuse license and features

# Langfuse Build-vs-Buy Research — Findings with Citations

## 1. Exact Current License (verified via raw file fetch, not memory)

Fetched directly: `curl https://raw.githubusercontent.com/langfuse/langfuse/main/LICENSE`

- **Core repo = MIT ("MIT Expat")** license. Verbatim: *"Content outside of the above mentioned directories or restrictions above is available under the 'MIT Expat' license as defined below"* — followed by standard MIT text (permission to use/copy/modify/sublicense/sell, "AS IS" warranty disclaimer).
- Copyright line: `Copyright (c) 2023-2026 Langfuse GmbH`
- Source: https://github.com/langfuse/langfuse/blob/main/LICENSE (raw: `raw.githubusercontent.com/langfuse/langfuse/main/LICENSE`)
- **Not** a single uniform license — it's split three ways: MIT (everything), a separate Enterprise license for `ee/` folders (see #3), and original licenses for third-party components.

## 2. Has the license changed over time?

- Core has been MIT since inception (open-core model from the start) — no wholesale relicense event like Elastic/HashiCorp had.
- **But the boundary of what's MIT vs. Enterprise-gated moved substantially on June 4, 2025**: Langfuse moved LLM-as-a-judge evals, annotation queues, prompt experiments, and the Playground from EE → MIT.
  - Blog: https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product
  - Changelog: https://langfuse.com/changelog/2025-06-04-open-sourcing-langfuse
  - Coverage: https://dev.to/clemra/all-langfuse-product-features-now-free-open-source-4140
- Net effect: core expanded, remaining commercial surface narrowed to compliance/admin features (SCIM, audit logs, project-level custom RBAC, UI customization, org-creation allowlisting).
- Self-hosted users needed to upgrade to Langfuse version >3.65 to get the newly-freed features (per search result summary of the blog).

## 3. The `ee/` (Enterprise Edition) License

Fetched directly: `curl https://raw.githubusercontent.com/langfuse/langfuse/main/ee/LICENSE`

- Named **"Langfuse Enterprise license"** — a source-available, non-OSI license, not open source.
- Key terms (verbatim): *"you may copy and modify the Software for development and testing purposes, without requiring a subscription"* but *"all such modifications and/or patches may only be used, copied, modified, displayed, distributed, or otherwise exploited with a valid Langfuse Enterprise License."* Production use requires a paid license/subscription.
- Directory: https://github.com/langfuse/langfuse/tree/main/ee (also gates `web/src/ee/`, `worker/src/ee/`)
- Gates: SCIM provisioning, audit logs, data retention policies, project-level fine-grained RBAC, UI customization, allow-listing who can create orgs (`LANGFUSE_ALLOWED_ORGANIZATION_CREATORS`), Instance Management API.
- Maintainer confirms independent reimplementation of EE features (e.g., custom RBAC) on the MIT core is explicitly permitted: https://github.com/orgs/langfuse/discussions/10745

## 4. Self-Hosting

- Documented at https://langfuse.com/docs/deployment/self-host
- Options: Docker Compose (dev/small-scale, "lacks HA, scaling, backup"), Kubernetes+Helm, Terraform (AWS/Azure/GCP), Railway.
- Same codebase/schema as Cloud. Architecture: Postgres, ClickHouse, Redis, S3-compatible blob storage.
- EE features (SCIM, audit logs, etc.) require a license key even when self-hosted — self-hosting does not unlock them for free.

## 5. Langfuse Cloud Pricing (fetched from https://langfuse.com/pricing)

| Tier | Price | Notes |
|---|---|---|
| Hobby | $0/mo | 50k units/mo, 30-day retention, 2 users, community support |
| Core | $29/mo | 100k units (+$8/100k after), 90-day retention, unlimited users |
| Pro | $199/mo | 3-yr retention, unlimited annotation queues, high rate limits, SOC2/ISO27001, HIPAA BAA available |
| Teams add-on | +$300/mo | SSO enforcement, fine-grained RBAC, dedicated Slack support (add-on to Pro) |
| Enterprise | $2,499/mo | Audit logs, SCIM API, custom rate limits, uptime SLA, dedicated support engineer |

## 6. Multi-Tenancy (Organizations/Projects/API Keys)

- **Core hierarchy is MIT/free in OSS self-hosted**: Organizations → Projects → Users. Confirmed via changelog https://langfuse.com/changelog/2024-08-13-organizations and https://langfuse.com/docs/rbac.
- API keys are project-scoped by default (public+secret key pair per project), not tied to a user — this is base functionality, not EE.
- EE-only additions on top: allow-listing which users can create orgs, org-scoped admin API for bulk automation (https://langfuse.com/self-hosting/administration/instance-management-api, https://langfuse.com/docs/administration/scim-and-org-api), fine-grained custom RBAC roles.
- **Conclusion: clean per-tenant separation via Projects + scoped API keys is available in the free OSS self-hosted edition**, not Enterprise-gated.

## 7. Budget Alerting / Cost Attribution

- "Spend Alerts" exist but are **Langfuse Cloud-only and organization-wide, not per-project**: https://langfuse.com/docs/administration/spend-alerts — quote: *"organization's total Langfuse Cloud subscription spend"* and explicitly *"not LLM or model costs you track in Langfuse observability."*
- Per-project usage is viewable via a Usage Monitoring dashboard report, but **no built-in per-project/per-tenant LLM cost budget alert or hard limit was found** in docs: https://langfuse.com/docs/observability/features/token-and-cost-tracking (page covers cost tracking/calculation only, no alerting).
- **Gap for your use case**: if you need per-tenant LLM-spend budget alerts/caps, this appears to require custom build on top of Langfuse's cost data, not an out-of-box feature.

## 8. TypeScript/Node SDK

- Repo: https://github.com/langfuse/langfuse-js — rewritten as v5 (mono-repo, scoped packages `@langfuse/client`, `@langfuse/core`, `@langfuse/langchain`); older `langfuse`/`langfuse-node`/`langfuse-core` packages are deprecated.
- Active/recent releases per https://github.com/langfuse/langfuse-js/releases: v5.9.1, v5.9.0, v5.8.0, v5.7.0, v5.6.0 all shipped within the last few weeks (Vercel AI SDK v7 integration, OTel media-upload toggle, multimodal dataset support).
- Features: `observe` decorator for async function tracing, OpenTelemetry-based instrumentation, `LangfuseAgent` class purpose-built for multi-step/agentic workflows (planning, tool use, self-correction), non-blocking async trace export. SDK reference: https://js.reference.langfuse.com/classes/_langfuse_tracing.LangfuseAgent.html
- Framework integrations confirmed: Claude Agent SDK JS/TS (https://langfuse.com/integrations/frameworks/claude-agent-sdk-js), OpenAI Agents SDK, LangChain.

**Note on methodology**: Items 1 and 3 were verified via direct `curl` of the raw GitHub file (bypassing any AI-summarized fetch) for exact verbatim text. All other items used WebFetch/WebSearch against the live langfuse.com and github.com pages cited above.

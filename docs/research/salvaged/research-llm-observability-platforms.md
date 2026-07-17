# Research LLM observability platforms

All five research agents are complete and I've verified the load-bearing license facts against primary sources myself. One notable corroboration: GitHub's API classifies the Langfuse repo's license as `NOASSERTION`/"Other" rather than MIT — consistent with the split-license structure described below.

---

# LLM Tracing / Cost-Tracking: Build vs. Buy

## 1. Langfuse

**License — split, and it matters.** The repo root [LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE) is **MIT ("MIT Expat"), Copyright (c) 2023-2026 Langfuse GmbH**, with an explicit verbatim carve-out: *"All content that resides under the `ee/`, `web/src/ee/`, and/or `worker/src/ee/` directories of this repository, if these directories exist, is licensed under the license defined in `ee/LICENSE`."* That [ee/LICENSE](https://github.com/langfuse/langfuse/blob/main/ee/LICENSE) is the **"Langfuse Enterprise license"** — proprietary, source-available, not OSI. It permits modification for dev/testing, but such modifications *"may only be used... with a valid Langfuse Enterprise License."* This split is why [GitHub's API reports the license as `NOASSERTION`/"Other"](https://api.github.com/repos/langfuse/langfuse), not MIT.

**License history — no relicense, but the boundary moved.** Contrary to the Elastic/HashiCorp-style rug-pull you may be thinking of, Langfuse's core has been MIT throughout (open-core from inception). What changed is the MIT/EE boundary, and it moved *in users' favor* on **June 4, 2025**: LLM-as-a-judge evals, annotation queues, prompt experiments, and the Playground moved **EE → MIT** ([blog](https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product)). Remaining EE-gated surface is narrow admin/compliance: SCIM, audit logs, data retention policies, project-level custom RBAC, server-side data masking, UI customization, org-management/instance APIs ([self-hosting/license-key](https://langfuse.com/self-hosting/license-key), which states *"All core Langfuse features and APIs are available in Langfuse OSS (MIT licensed) without any limits"*).

**Self-host vs cloud.** Self-hosting is free and fully featured minus EE items — Docker Compose, K8s/Helm, Terraform ([docs](https://langfuse.com/self-hosting)). **But the stack is Postgres + ClickHouse + Redis + S3-compatible blob storage** — three infra components you don't currently run. Cloud: Hobby $0 (50k units/mo), Core $29/mo, Pro $199/mo, Teams add-on +$300/mo, Enterprise $2,499/mo ([pricing](https://langfuse.com/pricing)).

**Multi-tenancy — genuinely good, and free.** Organizations → Projects → Users, with **project-scoped API key pairs** as base (non-EE) functionality ([RBAC docs](https://langfuse.com/docs/rbac), [orgs changelog](https://langfuse.com/changelog/2024-08-13-organizations)). One self-hosted instance can cleanly separate traces/costs per tenant. Only org-creation allow-listing and *custom* RBAC roles are EE.

**Budget alerting — the critical gap.** Langfuse's ["Spend Alerts"](https://langfuse.com/docs/administration/spend-alerts) are **Cloud-only, organization-wide, and explicitly about your Langfuse subscription bill — *"not LLM or model costs you track in Langfuse observability."*** Per-project LLM cost is *tracked* ([token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)) but **there is no built-in per-tenant LLM budget alert or hard cap.**

**TS/Node SDK — the best of the four.** [langfuse-js](https://github.com/langfuse/langfuse-js) v5 is a scoped mono-repo (`@langfuse/client`, `@langfuse/core`), OTel-based, with an `observe` decorator, non-blocking async export, and a purpose-built [`LangfuseAgent`](https://js.reference.langfuse.com/classes/_langfuse_tracing.LangfuseAgent.html) class for multi-step agentic workflows. Releases shipping weekly.

**Verdict:** Best-in-class trace UI and free project-scoped multi-tenancy, but costs you three new infra dependencies and still won't give you per-tenant budget alerts.

## 2. Helicone

**License:** **Apache-2.0**, no directory carve-outs, Copyright Helicone Inc 2023 ([LICENSE](https://raw.githubusercontent.com/Helicone/helicone/main/LICENSE); [API confirms `Apache-2.0`](https://api.github.com/repos/Helicone/helicone)). Cleanest license of the four.

**Activity:** ~5,955 stars, last push 2026-07-05; latest *tagged* release `v2025.08.21-1` (tags are stale relative to commits — they appear to deploy continuously).

**Self-host:** Yes, and **lighter than Langfuse** — a single `helicone-all-in-one` Docker image bundling Postgres + ClickHouse + MinIO, no separate Redis/worker layer ([docs](https://docs.helicone.ai/getting-started/self-host/docker)). Cloud: Hobby free (10k req/mo), Pro $79/mo, Team $799/mo, Enterprise custom ([pricing](https://helicone.ai/pricing)).

**Multi-tenancy — weakest fit.** "Organizations" is a **billing/workspace construct** (1 org on Pro, 5 on Team), not a tenant hierarchy. There's no native per-tenant project model or per-tenant-scoped API keys; the documented tenant-scoping mechanism is **custom property headers** (`Helicone-Property-*`) ([cost-tracking cookbook](https://docs.helicone.ai/guides/cookbooks/cost-tracking)). For AdWasta that means tenant_id becomes a string tag, not a first-class isolation boundary.

**Integration — proxy-first, and this is the crux.** The flagship path routes your LLM traffic through `ai-gateway.helicone.ai`, where *"Helicone maintains the keys for you"* ([quick-start](https://docs.helicone.ai/getting-started/quick-start)). An **async non-proxy mode exists** — logging *"not on the critical path,"* no uptime dependency — but it **forfeits the gateway features** (caching, rate limiting, retries) ([proxy-vs-async](https://docs.helicone.ai/references/proxy-vs-async)). So Helicone's differentiators require putting a third party in the request path of every Brain→arm call. Cost budget alerts are a Pro+ feature.

**Verdict:** Lightest self-host and a permissive license, but proxy-first design and tag-based (not native) multi-tenancy make it a poor structural fit for tenant-isolated AdWasta.

## 3. OpenLLMetry / Traceloop

**License:** **Apache-2.0** ([LICENSE](https://raw.githubusercontent.com/traceloop/openllmetry/main/LICENSE)). ~7,308 stars, last push 2026-07-13 — actively maintained.

**What it actually is:** An **OpenTelemetry instrumentation library, not a product.** It emits OTel spans and ships **zero storage and zero UI**. Its GenAI semantic conventions were upstreamed into OpenTelemetry proper. It instruments 16 providers (OpenAI, Anthropic, Bedrock, Gemini…), 9 frameworks (LangChain, LangGraph, CrewAI, OpenAI Agents SDK…), and 7 vector DBs ([repo](https://github.com/traceloop/openllmetry)). You configure an exporter → Traceloop's hosted platform, an OTel Collector, or 25+ backends (Datadog, Honeycomb, Grafana, SigNoz…) ([docs](https://www.traceloop.com/docs/openllmetry/introduction)). **You must bring your own backend.**

**Hosted backend:** Traceloop the company sells a separate **proprietary, closed-source** SaaS (app.traceloop.com) — the [GitHub org](https://github.com/traceloop) contains only SDKs, no dashboard/backend repo. Free tier: 50k spans/mo, 5 seats, 24h retention; Enterprise: custom, incl. on-prem ([pricing](https://www.traceloop.com/pricing)).

**Multi-tenancy:** **None, in either the library or the SaaS.** Pricing differentiates only by seats and retention — no tenant segregation or cost allocation. You'd stamp `tenant_id` as an OTel span/resource attribute and aggregate downstream yourself.

**Verdict:** Not a competitor to `agent_traces` — it's a complement, and the most interesting one: an Apache-2.0, vendor-neutral instrumentation layer you could write *into* your own table.

## 4. Braintrust

**License:** **Proprietary, closed-source platform with open SDKs.** No open-source core. SDKs are **Apache-2.0** ([braintrust-sdk-python LICENSE](https://github.com/braintrustdata/braintrust-sdk-python/blob/main/LICENSE), Copyright 2023 Braintrust Data LLC; JS and Rust SDKs likewise), and `autoevals` is MIT ([org](https://github.com/braintrustdata)). The backend/control plane is not open.

**Self-host — with an asterisk.** Three tiers: SaaS, BYOC, and "self-hosted" ([deployment docs](https://braintrust.dev/docs/admin/deployment/index.md)). But even in **self-hosted mode, Braintrust always hosts the control plane** (UI, auth, metadata); you only run the data plane (API, Postgres, Redis, object storage, Brainstore) on your infra ([self-hosting architecture](https://braintrust.dev/docs/admin/self-hosting/architecture.md)). **You can never fully sever the vendor dependency.** Pricing: Starter $0, Pro $249/mo, Enterprise custom ([pricing](https://www.braintrust.dev/pricing)).

**Multi-tenancy:** Organization → Projects ([projects guide](https://www.braintrust.dev/docs/guides/projects)), with permission groups per project. No sub-org-per-tenant concept.

**Cost tracking:** Per-project cost/token dashboards ([monitor guide](https://www.braintrust.dev/docs/guides/monitor)). Spend alerts exist (up to 3 thresholds, email/Slack) but are **informational about your invoice and explicitly do not cap usage** ([billing docs](https://braintrust.dev/docs/admin/billing/monitor-usage.md)).

**Verdict:** Eval-first platform ("Ship quality AI at scale") that can't be fully self-hosted and is closed-core — wrong shape for a self-hosted, tenant-isolated cost ledger.

## Comparison

| | **Langfuse** | **Helicone** | **OpenLLMetry/Traceloop** | **Braintrust** |
|---|---|---|---|---|
| **License** | MIT core + proprietary `ee/` ([LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE)) | Apache-2.0, no carve-outs | Apache-2.0 (lib); SaaS closed | Platform closed; SDKs Apache-2.0 |
| **License changed?** | No relicense; EE→MIT boundary *loosened* [Jun 2025](https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product) | No | No | N/A (never OSS) |
| **Self-host** | Free, full (minus EE) | Free, full | Lib: N/A. SaaS: on-prem @ Enterprise | **Partial only** — control plane stays theirs |
| **Infra added** | Postgres + ClickHouse + Redis + S3 | Postgres + ClickHouse + MinIO (1 image) | None (BYO backend) | Postgres + Redis + object store + Brainstore |
| **Stars / last push** | ~31.3k / 2026-07-17 | ~5.9k / 2026-07-05 | ~7.3k / 2026-07-13 | n/a (SDKs only) |
| **Native multi-tenant** | **Yes** — Org→Project, project-scoped API keys, free in OSS | Weak — billing orgs + property tags | **None** | Org→Project |
| **Per-tenant LLM budget alerts** | **No** — spend alerts are Cloud-only + about *your Langfuse bill* | Pro+ alerts, tag-based | No | No — invoice alerts, no caps |
| **TS/Node SDK** | Excellent (v5, OTel, `LangfuseAgent`) | Good (proxy or async) | Good (OTel-native) | Good (Apache-2.0) |

## Recommendation: keep `agent_traces`

**No, adopting one of these four is not clearly better for AdWasta's stated need. Keep the custom table.** The reasoning is concrete, not contrarian:

1. **The feature that motivated this question doesn't exist in any of them.** Per-tenant-per-day LLM budget alerting is **absent from all four**. Langfuse's spend alerts are Cloud-only and explicitly *"not LLM or model costs you track in Langfuse observability"* ([docs](https://langfuse.com/docs/administration/spend-alerts)); Braintrust's alerts are invoice thresholds that *"do not interrupt or cap usage"* ([docs](https://braintrust.dev/docs/admin/billing/monitor-usage.md)). You are building that logic regardless. A `SUM(cost) GROUP BY tenant_id, date` against a table you already own is *less* work than reading it back out of a vendor's API.

2. **Your budget data wants to live next to your billing data.** Budget enforcement needs to join `tenant_id` against tenant plans/limits/entitlements in your existing Postgres, transactionally, and gate the next agent run. Externalizing the cost ledger to ClickHouse-behind-an-API turns a `JOIN` into a network call plus reconciliation. For a system whose non-negotiable is *"every table and query is scoped by tenant_id,"* the ledger belongs in the tenant-scoped DB.

3. **The infra cost is real.** Langfuse self-host means running **ClickHouse + Redis + S3** alongside your one Postgres ([docs](https://langfuse.com/self-hosting)) — for a platform whose current footprint is one database. That's a meaningful operational step-change to buy a dashboard.

4. **What you'd genuinely be giving up is the UI, not the storage.** Community consensus converges here: the value-add of these tools is the **visual trace tree** for stepping through multi-span agent runs, plus prompt-versioning and eval tooling — not raw storage capability ([Helicone's own buy-vs-build post](https://www.helicone.ai/blog/buy-vs-build-llm-observability)). The custom-Postgres-per-tenant-cost pattern is a recognized, legitimate approach, commonly run *alongside* a tracing tool rather than replaced by one ([per-tenant cost attribution write-up](https://particula.tech/blog/per-tenant-llm-cost-attribution-multi-tenant-saas)).

**The hedge I'd actually recommend:** instrument with **OpenTelemetry via OpenLLMetry (Apache-2.0)** rather than hand-rolled logging calls. Write a span processor that lands spans into `agent_traces` with `tenant_id` as a resource attribute. This costs little now and means that *if* debugging Brain→arms fan-out becomes painful at scale, you point an exporter at a self-hosted Langfuse and get the trace UI **without re-instrumenting anything** — Langfuse's own JS SDK is OTel-based, so the wire format already lines up. You keep the ledger authoritative in Postgres and treat Langfuse as an optional read-only debugging lens.

**If you later decide you want a tool, it's Langfuse** — MIT core, free project-scoped multi-tenancy with per-project API keys (not EE-gated), 31k stars, pushed today, and the strongest TS agent-tracing SDK. Just adopt it for the *debugging UI*, and keep budget enforcement in your own table where it belongs.

*Caveat worth flagging: the EE carve-out means if you ever need audit logs, data retention policies, or project-level custom RBAC on a self-hosted instance, those are paid — and for a multi-tenant marketing platform handling customer data, audit logs and retention policies are plausibly things you'll eventually want. Reimplementing them independently on the MIT core is [explicitly permitted](https://github.com/orgs/langfuse/discussions/10745), but that's a fork you'd maintain.*

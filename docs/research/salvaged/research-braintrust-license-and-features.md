# Research Braintrust license and features

All findings gathered. Here's the structured report.

## Braintrust (braintrust.dev) — Build vs. Buy Research

**1. License model**
- Core platform: **proprietary, closed-source SaaS**. The main braintrust.dev product/backend is not open source.
- SDKs ARE open source, separately licensed:
  - `braintrust-sdk-javascript` — Apache-2.0 — https://github.com/braintrustdata
  - `braintrust-sdk-python` — Apache-2.0, confirmed via LICENSE file (Apache License Version 2.0, Copyright 2023 Braintrust Data LLC) — https://github.com/braintrustdata/braintrust-sdk-python/blob/main/LICENSE
  - `braintrust-sdk-rust` — Apache-2.0
  - `autoevals` (eval library) — MIT
  - `braintrust-proxy`, `braintrust-cookbook` — public, tooling repos
  - Source: https://github.com/braintrustdata and homepage footer reference to "Open source libraries and tools" — https://www.braintrust.dev/
- **Conclusion: SDK/tooling = open source (Apache-2.0/MIT); platform/control plane = closed proprietary SaaS.**

**2. Self-hosting — NOT cloud-only. Three deployment tiers exist:**
Source: https://braintrust.dev/docs/admin/deployment/index.md
- **SaaS**: Braintrust hosts both control plane and data plane (fully managed).
- **BYOC** (Bring Your Own Cloud): Braintrust operates both planes, but data plane runs inside your own cloud account. Detail: https://braintrust.dev/docs/admin/deployment/byoc.md
- **Self-hosted**: Braintrust hosts only the control plane (UI, auth, metadata); you deploy/operate the data plane (API, Postgres, Redis, object storage, Brainstore engine) on your own infra via Braintrust's published Terraform/deployment artifacts (AWS via ECS/EC2, GCP/Azure via Kubernetes). Source: https://braintrust.dev/docs/admin/self-hosting/index.md and https://braintrust.dev/docs/admin/self-hosting/architecture.md
- Control plane never touches sensitive data in either BYOC or self-hosted mode (per architecture doc).

**3. Pricing** — https://www.braintrust.dev/pricing
- **Starter**: $0/mo — $10 credits + token rates, 1GB processed data (+$4/GB after), 10k scores (+$2.50/1k after), 14-day retention, unlimited users/projects/datasets/experiments, community support.
- **Pro**: $249/mo — $249 credits + token rates, 5GB data (+$3/GB), 50k scores (+$1.50/1k), 30-day retention ($0.50/GB/mo extra), custom charts, priority support, basic RBAC, unlimited human review scores, 6–12 months free for qualifying startups.
- **Enterprise**: Custom pricing — custom retention/S3 export, full custom RBAC, SAML SSO, MFA, DPA/BAA, uptime SLA, dedicated support.

**4. Multi-tenant/project support** — https://www.braintrust.dev/docs/guides/projects and https://braintrust.dev/docs/admin/organizations.md
- Two-tier hierarchy: **Organization** (top level, billing/account) → **Projects** (contain logs, experiments, datasets, prompts).
- Each customer/tenant could get its own project with separate logs/experiments/datasets, plus permission groups to control per-project access (https://braintrust.dev/docs/admin/access-control/index.md). Docs don't detail deeper tenant-isolation guarantees beyond project-level separation — no explicit "sub-organization per tenant" concept found.

**5. Cost tracking**
- Yes — tracks tokens/cost per project via monitoring dashboards, with preset charts for "Total LLM cost" and "Token count," custom measures with a "Cost: US dollars" unit. Source: https://www.braintrust.dev/docs/guides/monitor
- **Spend alerts exist but are informational-only, not hard limits**: up to 3 thresholds, notify via email/Slack when invoice total hits a threshold; explicitly do **not** interrupt or cap usage. Separate automatic Topics-credit notifications fire at 60%/100% consumption. Source: https://braintrust.dev/docs/admin/billing/monitor-usage.md
- No true budget-cap/hard-limit enforcement found.

**6. Positioning** — https://www.braintrust.dev/
- Headline: "Ship quality AI at scale." Explicitly framed as **both** eval/experimentation AND observability: "AI observability and evaluation for the whole team. From engineering to product, in one platform" — three pillars: observability (tracing/monitoring), evals (testing/experimentation), automation (pattern detection/quality gates). Confirms it's an eval-first platform with observability bundled in, not a pure lightweight cost-tracing tool.

# Research Helicone license and features

# Helicone Build-vs-Buy Research Findings

## 1. License (verified via direct LICENSE fetch)
- **Apache License 2.0** — confirmed by fetching the raw file directly.
  Source: https://raw.githubusercontent.com/Helicone/helicone/main/LICENSE
- GitHub repo page also displays an "Apache-2.0" license badge.
  Source: https://github.com/Helicone/helicone
- **Caveat:** Helicone also maintains a separate repo, `Helicone/ai-gateway` ("fully open-sourced" per its description), which I did **not** independently verify for a differing license — check https://github.com/Helicone/ai-gateway/blob/main/LICENSE before relying on it. No other sub-license was found in the main repo's fetched content.

## 2. Self-host vs. Cloud
- Fully self-hostable: 4 documented paths — Manual Installation, **Docker Compose** (single `helicone-all-in-one` image), Kubernetes (Helm charts), and Cloud (AWS/etc).
  Source: https://docs.helicone.ai/getting-started/self-host/docker
- Required infra (bundled into one container): **PostgreSQL**, **ClickHouse**, **MinIO (S3-compatible)**, plus the web dashboard and "Jawn API + LLM Proxy" service. Ports 5432/8123 are internal-only.
- **Comparison to Langfuse**: Langfuse self-host requires Postgres + ClickHouse + **Redis/Valkey** (queue/cache) + S3 blob storage + separate Web and Worker containers.
  Source: https://langfuse.com/self-hosting
- **Verdict**: Helicone's self-host stack is **lighter** — same two databases (Postgres+ClickHouse) but no separate Redis/queue layer or worker process documented; it ships as one all-in-one image vs. Langfuse's multi-container application layer.

## 3. Cloud Pricing (fetched directly)
Source: https://helicone.ai/pricing
- **Hobby**: Free — 10K req/mo, 1GB storage, 1 seat/1 org, 7-day retention, 10 logs/min.
- **Pro**: **$79/mo** — unlimited seats, 1 org, 1-month retention, 1,000 logs/min, alerts/reports, HQL query language.
- **Team**: **$799/mo** — 5 orgs, 3-month retention, 15,000 logs/min, SOC-2/HIPAA, dedicated Slack.
- **Enterprise**: Custom — unlimited orgs, forever retention, 30,000 logs/min, SAML SSO, on-prem, dedicated support.

## 4. Multi-tenant / Organizations
- "Organizations" exist as a **billing/workspace** construct in pricing (1 org on Pro, 5 on Team, unlimited on Enterprise) — not a documented hierarchical tenant model.
  Source: https://helicone.ai/pricing
- The docs' full page index has **no dedicated page** for "organizations," "multi-tenant," "teams," or "tenant."
  Source: https://docs.helicone.ai/llms.txt
- A direct fetch of a guessed `docs.helicone.ai/features/organizations` URL returned **404** — no deep org/RBAC docs found at that path; a full docs sitemap crawl would be needed to confirm if this exists elsewhere.
- Practical tenant-scoping mechanism documented is **custom properties** (`Helicone-Property-*` headers) and per-user IDs, not a native project/tenant hierarchy or per-tenant-scoped API keys.
  Source: https://docs.helicone.ai/guides/cookbooks/cost-tracking

## 5. Cost Tracking, Budgets, Alerts
- Cost attribution via **Sessions** (groups related calls into a workflow cost) + **custom property headers** (e.g., `Helicone-Property-UserTier`, `Helicone-Property-Feature`) for per-user/per-segment breakdown.
- Budget alerts: recommended graduated thresholds (50/80/95%), daily/monthly spend limits, Slack notifications; alerting is a **Pro-plan+** feature.
  Source: https://docs.helicone.ai/guides/cookbooks/cost-tracking
- Rate limits (per-user, per-API-key, custom policies) are referenced via the AI Gateway, but I could not fetch a primary doc page directly for this — sourced from search-result synthesis only, not a direct fetch; treat as **needs re-verification**.

## 6. Integration Model: Proxy vs. Async/SDK
- **Primary model is proxy-based**: point your base URL to `https://ai-gateway.helicone.ai`; "Helicone maintains the keys for you." Setup is described as just 3 steps (account, key, endpoint swap).
  Source: https://docs.helicone.ai/getting-started/quick-start
- **Async/non-proxy mode also exists**: logging is "not on the critical path" — zero propagation delay to your requests, no dependency on Helicone's uptime, but it **loses gateway features** (no caching, rate limiting, retries, automatic prompt formatting).
  Source: https://docs.helicone.ai/references/proxy-vs-async
- **Tradeoff summary**: Proxy = one-line setup + full feature set (caching, rate limits, threat detection) at the cost of routing all traffic through Helicone (added hop latency + availability dependency). Async = resilient/independent like Langfuse's SDK-only instrumentation, but a reduced feature set — Helicone's own docs frame async as the "escape hatch," not the flagship path.

## 7. GitHub Activity
- **Stars**: ~5,700–6,000 (fetched page reported "6,000"; search synthesis reported "5,766" mid-2026) — minor discrepancy, recommend a live check.
  Source: https://github.com/Helicone/helicone
- **Latest tagged release**: `v2025.08.21-1` (Aug 21, 2025) per GitHub page — nearly a year stale relative to today (2026-07-17); may indicate continuous deploy without frequent tags rather than inactivity — verify commit activity directly rather than relying on release tags alone.

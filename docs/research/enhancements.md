# Research review — findings, and reconciliation with `fable5-reviewing`

**Date:** 2026-07-17
**Basis:** 25 primary-source reports in `docs/research/salvaged/`
**Decisions:** `docs/adr/0001`, `0002`, `0003`

---

## Read this first

There are **two parallel revisions** of this plan in flight:

1. **Branch `fable5-reviewing`** (4 commits, 574 insertions across `design.md`, `implementation-plan.md`, `CLAUDE.md`, `README.md`, `.env.example`) — not merged to `master`.
2. **This research corpus + ADRs 0001-0003** — committed to `master`.

They were produced independently and **agree on the big call** (defer browser publishing). They do not conflict in file terms — the branch rewrites the design docs, this work only adds `docs/research/` and `docs/adr/`. **Merge `fable5-reviewing` first**, then apply the deltas in the ADRs on top. Doing it in the other order guarantees conflicts in `design.md`.

---

## What `fable5-reviewing` adds that this research did not have

The branch is **ahead of master and ahead of my analysis** on several counts. These are real additions, not duplicates:

| Addition | Where | Why it matters |
|---|---|---|
| **MEASURE pillar + Analyst arm (Riley)** | §1.1, §8 | Five pillars, ten arms. Closes the loop: `published_items` → `post_metrics` → `performance_insights` feed the next STRATEGY/CREATION round. The four-pillar model had no feedback path at all — content quality could never improve from evidence. |
| **"LLM never computes stats"** | §8, CLAUDE.md | The Analyst arm *interprets* pre-computed output from `src/metrics/`; deterministic code does the arithmetic. Correct instinct — LLMs are unreliable calculators, and this makes metrics auditable. |
| **Unit economics + hard budget caps** | §6.1, `.env.example` | `DAILY_BUDGET_USD` / `MONTHLY_BUDGET_USD` / `MAX_RUN_COST_USD`, harness-enforced hard stops, ≥3× pricing floor. **This independently solves the gap I flagged in Langfuse** (no per-tenant spend cap). Enforcement lives in the harness where it belongs. |
| **Postgres RLS from day one** | §7 | Two-layer isolation (middleware + RLS on `app.tenant_id`). Master had this as "optional later." Cheap now, painful to retrofit. **But see the auth gap below — RLS without authentication is a lock with no door.** |
| **ToS-safe intel sourcing (locked)** | §12 | "Facebook/IG/X aggressively block scraping and require login — `fetch_public_profile` is not a viable primary source." Never login-gated scraping, fake accounts, or anti-bot evasion. This closes the "how do we actually get competitor data" gap honestly rather than hand-waving it. |
| **Email compliance gate** | §21, CLAUDE.md | Suppression list + unsubscribe + consent attestation before first send. CAN-SPAM/GDPR is a legal problem, not a feature gap. |
| **Envelope encryption, per-tenant DEKs** | `.env.example` | `CREDENTIALS_MASTER_KEY` becomes a KEK. Stronger than the flat AES-256-GCM on master, and matches what I'd have recommended. |
| **Release gates R1/R2/R3 + ≥10 golden fixtures/arm** | §23 | Validation slice before scaling. |
| **ADR-001 inline** | §10.0 | Browser publishing deferred, with revisit conditions. Reached independently. |

**Assessment: the branch should be merged.** It is a better plan than master on every axis it touches.

---

## What this research adds that the branch is missing

### 1. The reach premise — upgraded from "unverified" to **refuted**, and one claim corrected

§10.0 says: *"The claim that API posts are penalized on organic reach is unverified; **Meta publicly denies it**."*

- **"Meta publicly denies it" could not be sourced** — no dated Meta/Instagram primary statement exists in 2023-2026. It circulates via marketing blogs. That specific sentence should be removed.
- The premise is not merely unverified — it is **refuted** by four controlled tests (Agorapulse +22.6%, Hootsuite 10,122 vs 7,189, Social Status +10.3%, CoSchedule "no significant difference"). Caveat: all small-N and vendor-run.
- Full evidence + ToS/litigation detail (hiQ's **$500K loss**, Van Buren, Meta v. Bright Data): **ADR-001**.

The branch's decision is right; its stated reason for that one row is the weakest part of an otherwise strong argument. ADR-001 replaces assertion with evidence.

### 2. **Authentication is still entirely absent** — the most serious remaining gap

The branch added RLS but **no authentication**. There is still no login, no session model, no token scheme anywhere in Phases 0-10.

RLS is keyed on an `app.tenant_id` session variable — but *nothing establishes which tenant the caller is*. The only candidate input is the `:id` path param, so RLS would faithfully isolate whatever tenant an attacker names. **Two-layer isolation over an unauthenticated identity is one layer with extra steps.** Under copy_pack-only there are no social credentials at risk, but cross-tenant strategy/intel/draft exposure and LLM-cost abuse both remain. → **ADR-002, Decision 1** (WorkOS AuthKit, Task 0.3a).

### 3. Hourly trend refresh — the requested feature, done correctly

Requested: trends every hour. The branch still specifies 24h staleness.

**Hourly LLM analysis is the wrong architecture** — 720 runs/tenant/month vs 30 (24×), which would blow §6.1's ~$6/mo RESEARCH envelope and trip `MONTHLY_BUDGET_USD` mid-month. And SMB-relevant trends don't move hourly; you'd get ~20 near-identical snapshots/day, contradicting §12's own "business relevance, not viral noise" rule.

**Right architecture:** hourly *checking*, event-driven *analysis*. Tier 0 (hourly, no LLM, conditional-GET RSS + one cheap Brave call, fingerprint compare) → gate → Tier 1 (full LLM arm only on real diff) → 24h forced fallback. This mirrors the `detect_campaign_change` pattern the design already has for competitors. → **ADR-003, Decision 1** (includes source costing and dedup thresholds).

Also: **SerpAPI is out of budget** — its cheapest plan ($25/mo) exceeds the entire ~$5-15 intel budget. It's still named in `.env.example` and Task 1.1. Brave ($5/1k) and Tavily (1k free credits) are the viable pair.

### 4. Nano Banana — two factual errors survive in §8.2 on both master and the branch

- **`nano_banana` and `gemini` are not separate providers.** "Nano Banana" is a marketing nickname for Google's Gemini image models — same API, same SDK, only the model string differs. Collapse to one `gemini` provider + `image_gen_model` config.
- **`1080x1080` is not a native size.** Native tiers are 1K (1024×1024) / 2K / 4K. Default should be 1024×1024.
- Plus: `@google/generative-ai` is **deprecated** (use `@google/genai`); variants = N sequential calls, not one; at Nano Banana Pro 1K, 3 variants = **$0.40/draft**, which at the 5-drafts/day cap could exceed the entire modeled tenant cost — **§6.1 has no image-generation row**. Brand reference images *are* well-supported (10 object + 4 character + 3 style refs), which is the strongest reason to stay on Gemini. → **ADR-003, Decision 2**.

### 5. Build-vs-buy — the branch evaluates none of these

Zero mentions of Mastra, Langfuse, or Ayrshare anywhere in the branch.

- **Mastra** (Apache-2.0) implements the exact locked architecture — supervisor agents + `suspend()`/`resume()` HITL, which *is* the approval inbox — the hardest part of the harness, currently slated to be hand-rolled. Adopt selectively (workflows + HITL only). Audit `ee/` gating first.
- **Langfuse** (MIT core) replaces the hand-rolled trace layer; Cloud, not self-hosted. §6.1's caps stay in the harness regardless.
- **Ayrshare** for v2 API publish — deletes OAuth/token-refresh/app-review entirely.
- **Rejected:** Postiz (AGPL-3.0 — embedding forces open-sourcing the fork), Trigger.dev (can't checkpoint a live browser; BullMQ already present). → **ADR-002**.

### 6. Smaller gaps neither revision covers

- **GDPR export/erasure** — the branch handles email unsubscribe-as-erasure, but there's no tenant-level export/erase, and `system_events` "forever" retention would hold PII indefinitely. Needs a `contains_pii` flag + per-category retention override.
- **Credential rotation** — envelope encryption is in; no rotation schedule or expiry field.
- **Backup/PITR** — still unmentioned despite Postgres being the sole system of record.
- **Health/readiness endpoints** — still absent.

---

## Recommended order

1. **Merge `fable5-reviewing` to master.** It's the better plan.
2. Apply **ADR-001**'s correction to §10.0 (drop the unsourced "Meta publicly denies it"; cite the evidence).
3. Apply **ADR-002**: auth into Phase 0 — *before* anything else, since RLS depends on a real identity to key on.
4. Apply **ADR-003**: Tier-0/Tier-1 trend split; fix §8.2's provider enum, default size, and SDK name.
5. Decide Langfuse (ADR-002, Decision 4 — still open).

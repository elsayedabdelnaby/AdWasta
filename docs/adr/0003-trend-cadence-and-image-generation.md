# ADR-003 — Trend cadence (hourly) and image generation (Nano Banana)

**Status:** Proposed
**Date:** 2026-07-17
**Affects:** `design.md` §1.1 (cycle order), §6.1 (unit economics), §8 (Trend arm), §8.2 (image generation), §12 (intel sources), §25 (defaults); `implementation-plan.md` Task 1.3, Task 3.3
**Evidence:** primary-source research, July 2026

---

## Decision 1 — Hourly trend *checking*, not hourly trend *analysis*

### The ask

Refresh trends every hour. Today: `intel_snapshots` type=trend runs on **24h staleness** (Task 1.3: "Staleness skip < 24h unless `force=true`"; §25: "Intel refresh | 24h staleness triggers re-run").

### Why the naive reading is wrong

Running the full LLM Trend arm hourly means **~720 runs/tenant/month instead of ~30 — a 24× increase**. That breaks two things at once:

1. **Budget.** §6.1 models the entire RESEARCH crew at ~$6.00/tenant/month and SERP API spend at ~$5-15. Hourly LLM trend analysis blows through both, and `MONTHLY_BUDGET_USD` (default 50) would hard-stop tenants mid-month — the caps would fire as designed, and the product would simply stop working.
2. **Signal.** Google's *Trending Now* refreshes every ~10 minutes and *Daily Trends* hourly ([blog.google](https://blog.google/products-and-platforms/products/search/google-trends-trending-now-update/), [support.google.com](https://support.google.com/trends/answer/4365533)) — but that measures **viral breakout volatility**, not "did anything business-relevant change for a bakery or an HVAC company." For a typical SMB tenant, category-relevant shifts move on a **daily-to-weekly** cadence. Polling hourly reproduces the same trend ~20+ times a day: cost and alert fatigue, no new information. This directly conflicts with §12's existing rule that the Trend arm "filters for business relevance — not viral noise."

### Decision: decouple poll frequency from analysis frequency

This is the standard pattern for news/brand monitoring and RSS pollers — cheap-poll, change-detect, analyze-on-diff-only:

| Tier | Cadence | Cost | What runs |
|---|---|---|---|
| **Tier 0 — watch** | Hourly | ~free, **no LLM** | Conditional-GET RSS/Google Alerts feeds (`If-None-Match` / `If-Modified-Since` → `304 Not Modified`, empty body) + one cheap Brave/Tavily call. Compute content fingerprint, compare to last stored. |
| **Gate** | — | — | Fingerprint materially unchanged → **stop**. No LLM, no citation synthesis, no snapshot row. |
| **Tier 1 — analyze** | Event-triggered (~1-4×/day/tenant in steady state) | full arm cost | On real diff: multi-call SERP fetch + LLM Trend arm with citations → `intel_snapshots` type=trend. |
| **Fallback** | 24h max | full arm cost | Force a Tier-1 run at least every 24h even with zero detected change — preserves the existing staleness SLA. |

**This mirrors a pattern the design already has.** §12 defines `detect_campaign_change` for the Competitor arm, and Task 1.4b runs competitor watch on a cron in "watch mode (lighter than full deep analysis)," alerting only on signal. The Trend arm gets the same shape — hourly instead of 12-hourly, and the codebase gains one consistent watch-then-analyze idiom rather than two.

**Net effect:** same-hour reaction capability, without 720 near-duplicate LLM analyses. Tier 0 keeps `intel_snapshots` clean and keeps §6.1's envelope intact.

### Dedup

Normalize each candidate (title + top snippet), fingerprint with **SimHash (64-bit)** or a small embedding. Treat as near-duplicate — bump a `last_seen` counter, no new row, no re-alert — when **Hamming distance ≤ 3/64** or **cosine similarity ≥ 0.90**. Only below that threshold does a new trend record materialize and Tier 1 fire. *(Thresholds are standard IR/dedup practice — SimHash ≤3-6/64, cosine 0.85-0.92 — inferred from established practice, not separately benchmarked. Tune against fixture data at the Phase 1 gate.)*

### Source selection under the ToS-safe constraint

§12's locked rule ("ToS-safe sources only — never login-gated social scraping") plus the §6.1 intel budget (~$5-15/tenant/month) disqualifies most of the field. Costs below are at 720 polls/tenant/month:

| Source | Verdict at hourly cadence |
|---|---|
| **RSS / Google Alerts RSS** | **Primary Tier-0 layer.** Free, effectively unlimited with polite conditional-GET polling. |
| **Brave Search API** | **Viable.** $5/1,000 requests, $5 free credit/mo, 50 qps ([brave.com/search/api](https://brave.com/search/api/)) → ~$0-8/tenant/mo. Cheapest paid option. |
| **Tavily** | **Viable, used sparingly.** 1,000 credits/mo free; $0.008/credit PAYG; basic search = 1 credit ([tavily.com/pricing](https://www.tavily.com/pricing), [docs](https://docs.tavily.com/documentation/api-credits)) → ~$0 at 1 call/poll, ~$17/mo at 3. |
| **Exa** | Probably viable — official page claims "up to 20,000 requests/mo free" but conflicts with third-party trackers; $7/1k search ([exa.ai/pricing](https://exa.ai/pricing)). **Verify in-dashboard before relying on it.** |
| **SerpAPI** | **Disqualified.** Cheapest paid plan is $25/mo for 1,000 searches ([serpapi.com/pricing](https://serpapi.com/pricing)) — the plan floor alone exceeds the entire intel budget. Note `.env.example` and Task 1.1 both still name SerpAPI as an option. |
| **Google Trends official API** | **Not usable.** Alpha, allowlist-gated since July 2025, no public pricing, not GA ([developers.google.com](https://developers.google.com/search/apis/trends)). |
| **pytrends / unofficial Trends** | **Disqualified by §12's ToS-safe rule.** Also archived April 2025, unmaintained. |
| **Reddit API** | **Disqualified.** Free tier is explicitly non-commercial; commercial has a **$12,000/yr minimum**. *(Inferred from converging third-party trackers, not confirmed on Reddit's own dev-terms page — verify before any adoption.)* |
| **YouTube Data API v3** | Free 10k units/day — but the quota is **shared product-wide, not per-tenant**; ~4 tenants at hourly cadence exhaust it. Not a scaling Tier-0 source. |

**Recommendation:** Tier 0 = conditional-GET RSS/Alerts + Brave. Keep Tavily for Tier 1 (analysis-time) calls where quality matters. Drop SerpAPI from the plan or mark it explicitly out-of-budget.

**Push beats poll where available:** WebSub/PubSubHubbub gives true push for RSS/Atom when the publisher supports a hub — adopt opportunistically, but not as primary plumbing (adoption is spotty).

---

## Decision 2 — Image generation: two factual errors in §8.2 to fix

§8.2 is well-structured — the "pixels only, Jordan writes the prompt" split, the flag gate, and the "never auto-publish" rule all stand. Two concrete details are wrong.

### Error 1 — `nano_banana` and `gemini` are not two providers

§8.2 declares:

```yaml
image_gen_provider: nano_banana   # nano_banana | gemini | stub
```
```typescript
provider: 'nano_banana' | 'gemini' | 'stub';
```

**"Nano Banana" is a marketing nickname for Google's Gemini image models — not a separate product or API.** Every Nano Banana variant is invoked through the same Gemini API, same SDK, same auth, same endpoint shape. Only the `model` string changes.

**Fix:** collapse to one provider with the model ID as config:

```yaml
image_gen_provider: gemini        # gemini | stub
image_gen_model: gemini-3-pro-image
```

Current lineage ([ai.google.dev](https://ai.google.dev/gemini-api/docs/image-generation), [DeepMind](https://deepmind.google/models/gemini-image/pro/)):

| Marketing name | Model ID | Status |
|---|---|---|
| Nano Banana (Aug 2025) | `gemini-2.5-flash-image` | GA (legacy) |
| Nano Banana 2 | `gemini-3.1-flash-image` | GA |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | GA |
| Nano Banana Pro | `gemini-3-pro-image` | GA (~June 2026; promoted from `-preview`) — *promotion date is secondary-sourced, unverified* |

### Error 2 — `1080x1080` is not a native output size

§8.2 sets `image_gen_default_size: "1080x1080"`. **Native tiers are 1K (1024×1024), 2K, and 4K** (plus 0.5K on 3.1 Flash). Use **1024×1024** as the default, and resample post-generation if a channel spec truly needs 1080×1080.

Aspect ratios in the adapter interface (`1:1 | 9:16 | 16:9 | 4:5`) are **all supported** — the API also offers `3:2, 2:3, 3:4, 4:3, 5:4, 21:9`.

### Confirmations and additions

- **Brand reference images work — this is the strongest reason to stay on Gemini.** Nano Banana 2 accepts up to **10 object refs + 4 character-consistency refs + 3 style refs**; Nano Banana Pro up to **6 object + 5 character**. §8.2's "Every generate call includes brand refs when available" rule is well-supported. Note the style-ref channel differs by model — pick Nano Banana 2 if style-ref count matters more than raw quality.
- **Variants:** no native multi-candidate parameter found. `variants: 1-3` means **N sequential calls**, not one call. Economically neutral (pricing is per-image), but the adapter must loop and the cost math is linear.
- **Cost per image** ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) — no free tier for image output: `gemini-2.5-flash-image` $0.039 flat; `gemini-3.1-flash-image` $0.067 (1K) / $0.101 (2K) / $0.151 (4K); Lite ~$0.034 (1K); `gemini-3-pro-image` **$0.134 (1K/2K)**, $0.24 (4K). Batch tier ~50% off.
  **§6.1 impact:** at Pro/1K, 3 variants = **$0.40/draft**. At the §25 cap of 5 drafts/platform/day, image generation alone could exceed the entire ~$25-35 modeled tenant cost. `image_gen_enabled` defaulting **off** is doing real economic work, not just caution — and §6.1's table has **no row for image generation**. Add one, and gate variants ≥2 behind an explicit per-tenant opt-in.
- **SDK:** current package is **`@google/genai`**. **`@google/generative-ai` is deprecated as of Nov 30, 2025** ([libraries](https://ai.google.dev/gemini-api/docs/libraries)). *Unverified:* the image-generation docs are titled "Interactions API" and samples use `ai.interactions.create({model, input})` rather than `generateContent` — **confirm the exact method shape against live docs before locking `ImageAdapter`.**
- **SynthID watermarking is applied to all generated images**, with no documented API opt-out ([DeepMind](https://deepmind.google/models/synthid/)). Commercial-use implications for API callers were **not verifiable** — worth a legal read before selling generated assets to tenants.
- **Rate limits are not published** — [docs](https://ai.google.dev/gemini-api/docs/rate-limits) punt to the per-account AI Studio dashboard. Read your own; don't budget from docs.
- **Content policy risk for a marketing tool:** expect friction generating identifiable people, public figures, and third-party trademarked logos ([Prohibited Use Policy](https://support.google.com/gemini/answer/16625148)). Whether passing a *tenant's own logo* as a reference image is exempt is **not confirmed** — validate early, since §8.2's brand-consistency rule depends on it.
- **Vertex AI vs Developer API:** `@google/genai` supports both; Vertex gives per-project IAM/service-account isolation and cleaner billing separation for multi-tenant, Developer API keys are simpler. *Not re-confirmed this session* — verify before choosing the isolation model.

### Alternatives (opinion-tier, no primary benchmark)

Gemini remains the right default given brand-reference support in one SDK. But on **text rendering specifically** — which matters for marketing assets — Ideogram and OpenAI's GPT Image are still cited ahead of Nano Banana Pro. Validate against real creative templates before treating text-in-image as solved.

---

## Consequences

- Task 1.3 (Trend arm) splits into a Tier-0 watch job + Tier-1 analysis arm; `detect_campaign_change` generalizes to cover trends.
- §25 default changes from "24h staleness triggers re-run" to "hourly watch; analysis on detected change; 24h max staleness."
- §6.1 gains an image-generation row and a Tier-0/Tier-1 split for RESEARCH.
- Task 1.1 / `.env.example` drop or de-prioritize SerpAPI; add Brave.
- §8.2 provider enum, default size, and SDK name are corrected; `ImageAdapter` interface confirmed against live docs before implementation.

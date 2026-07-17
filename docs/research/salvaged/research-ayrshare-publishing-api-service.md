# Research Ayrshare publishing API service

# Ayrshare vs. self-hosted — publishing-API build-vs-buy research

## Ayrshare (ayrshare.com)

**Architecture:** SaaS-only — a cloud REST API called with an API key. No self-hosted/on-prem option; confirmed in both the GitHub SDK README and API docs intro (github.com/ayrshare/social-media-api, ayrshare.com/docs/introduction).

**Pricing** is per-social-profile, not per-seat (ayrshare.com/pricing/):
- Premium — $149/mo, 1 profile (up to 13 accounts across networks)
- Launch — $299/mo, 10 profiles (up to 130 accounts); 28-day free trial, no card required
- Business ("most popular") — $599/mo base, 30 profiles included, then tiered add-ons: $8.99/$3.49/$2.49 per extra profile (31–100 / 101–500 / 500+), or $7.99/$2.99/$1.99 on annual billing
- Enterprise — custom, 300+ profiles, dedicated account manager; Max Pack ($300/mo) and FB Boosted-Ads add-on ($100/mo)

**Multi-tenant fit:** the **Business Plan** is exactly AdWasta's shape (ayrshare.com/docs/multiple-users/business-plan-overview, ayrshare.com/business-plan-for-multiple-users/). It's built for agencies/SaaS platforms managing many end-customers' accounts under one API/dashboard, with a white-labelable JWT account-connection flow — each tenant OAuths their own accounts without us touching Meta/X app review or token storage. Each tenant maps to an isolated "User Profile" with its own connected accounts and rate limit; Ayrshare's own marketing claims this runs at "25M+ daily API calls, 20K+ daily posts" in production (ayrshare.com/use-cases/saas-platforms/ — self-reported, not independently verified).

**Platforms** (13 networks, per ayrshare.com/docs/introduction): Facebook, Instagram, X/Twitter, LinkedIn, TikTok, YouTube, Pinterest, Reddit, Telegram, Bluesky, Snapchat, Threads, Google Business Profile. Note: the Messaging/inbox API is limited to Instagram/Facebook/X, and Ads API is Facebook-only.

**Rate limits** (ayrshare.com/docs/errors/errors-http): 300 API requests per 5-minute window per User Profile (i.e., per tenant); 1,000 accumulated 429s in 24h auto-suspends the profile. For a human-approval-gate flow firing one publish call at a time, this ceiling shouldn't bind — the real constraint would be Meta/X's own per-app limits, which Ayrshare itself is subject to.

**Reviews/limitations:** G2 reviews (search-indexed, direct fetch blocked with 403) skew positive — fast API sync, good docs. Trustpilot reportedly ~4 stars per search snippets, but I could not independently confirm via direct fetch (both g2.com and trustpilot.com blocked automated fetch, so treat as secondary-source only). Third-party "alternatives" blogs cite usage-based pricing surprises at scale and clunky @mention handling (needs platform user IDs, not handles) as recurring complaints; one anecdotal forum complaint described an account suspension dispute and data-access loss after a missed payment — unverified, treat as anecdote not pattern. Ayrshare's own candid "when not to use us" page (ayrshare.com/why-you-shouldnt-use-ayrshare/) says it's not for teams wanting a polished visual dashboard (API/JSON-first) or a handful of manually-managed accounts — the flip side being that AdWasta's programmatic multi-tenant use case is precisely their target buyer.

## Self-hosted alternative: Postiz / Mixpost

- **Postiz** (github.com/gitroomhq/postiz-app): AGPL-3.0, full source, REST API + Node SDK, 33 platforms. AGPL's copyleft trigger is modifying-and-exposing as a network service; calling it out-of-process via HTTP as an internal microservice (not modifying/embedding its code, not exposing its UI to tenants) avoids that. Real infra burden: Postgres, Redis, Temporal.io, Node 22, S3-compatible storage.
- **Mixpost** (github.com/inovector/mixpost, mixpost.app/pricing): Lite is free/MIT; Pro ($299 one-time) explicitly **forbids** building a SaaS on it; only Enterprise ($1,199 one-time) is licensed for multi-tenant/SaaS use with white-label + billing.

**Tradeoff:** Ayrshare buys instant multi-tenant OAuth/token-refresh handling and pass-through of platform API-review burden, for a scaling per-tenant fee (~$2–9/profile/mo in our range). Self-hosting trades that recurring cost for us owning OAuth flows, token refresh, webhooks, and infra per platform — cheaper at scale, more engineering-months up front and ongoing.

## Other hosted competitors (one-liners)

- **Late**, rebranded mid-2026 to **Zernio** (getlate.dev → zernio.com/pricing): usage-based, no seat plans — free up to 2 profiles, then $6/$3/$1 per profile/mo as volume grows (3–10 / 11–100 / 101+), custom Enterprise at 2,000+ — meaningfully cheaper per-profile than Ayrshare at our scale.
- **Publer** (publer.com): Professional $4/account/mo, Business $8/account/mo (annual) — Business unlocks a "public API," but it's a scheduler-first product, not API-first.
- **SocialPilot** (socialpilot.co): Premium $85/mo, Ultimate $170/mo, API gated behind custom-priced Enterprise.
- **Metricool** (metricool.com): Free / $22 / $54 per month — has an API but is analytics/scheduling-first, not marketed as a publishing-API service.

## Pricing comparison

| Provider | Tiers / price | Profiles/accounts included | Platforms | Multi-tenant / agency support | Notes |
|---|---|---|---|---|---|
| **Ayrshare** | Premium $149/mo · Launch $299/mo · Business $599/mo · Enterprise custom | 1 · 10 · 30 (+$2.49–8.99/extra) · 300+ | 13 (FB, IG, X, LinkedIn, TikTok, YouTube, Pinterest, Reddit, Telegram, Bluesky, Snapchat, Threads, GMB) | Yes — dedicated Business Plan, white-label JWT onboarding, isolated per-tenant profile + rate limit | SaaS-only, no self-host; 300 req/5min per profile |
| **Late / Zernio** | Free (2 profiles) · $6/profile (3–10) · $3/profile (11–100) · $1/profile (101+) · Enterprise custom (2,000+) | Usage-based, no caps | 15+ | Cheap per-profile scaling, not agency-branded | Rebranded getlate.dev → zernio.com |
| **Publer** | Professional $4/acct/mo · Business $8/acct/mo (annual) | Per connected account | Not itemized in sources found | Business unlocks "public API" | Scheduler-first, not API-first |
| **SocialPilot** | Premium $85/mo · Ultimate $170/mo · Enterprise custom | Agency seat/client bundles | Not itemized | Agency-positioned; API in Enterprise | Not per-profile pricing |
| **Metricool** | Free · Starter $22/mo · Advanced $54/mo | Not profile-metered | Standard set | Limited, analytics-first | Has API, not a dedicated publishing-API product |
| **Postiz** (self-host) | Free (OSS) | Unlimited, self-run | 33 | Yes if self-managed; AGPL-3.0 copyleft risk if modified+exposed | Own OAuth/infra: Postgres, Redis, Temporal, Node 22, S3 |
| **Mixpost** (self-host) | Lite free (MIT) · Pro $299 one-time (no SaaS use) · Enterprise $1,199 one-time (SaaS allowed) | Unlimited per license | Standard set (varies by tier) | Only Enterprise licensed for multi-tenant/SaaS | One-time license, self-hosted, own OAuth |

**Sources:** ayrshare.com/pricing/, ayrshare.com/docs/introduction, ayrshare.com/docs/errors/errors-http, ayrshare.com/docs/multiple-users/business-plan-overview, ayrshare.com/business-plan-for-multiple-users/, ayrshare.com/use-cases/saas-platforms/, ayrshare.com/why-you-shouldnt-use-ayrshare/, ayrshare.com/complete-guide-to-handling-rate-limits-prevent-429-errors/, github.com/ayrshare/social-media-api, g2.com/products/ayrshare-api/reviews (indexed snippet, direct fetch 403'd), trustpilot.com/review/ayrshare.com (indexed snippet, direct fetch 403'd), getlate.dev/zernio.com/pricing, publer.com (via search), socialpilot.co (via search), metricool.com (via search), github.com/gitroomhq/postiz-app, github.com/inovector/mixpost, mixpost.app/pricing.

**Caveat:** two review-site pages (G2, Trustpilot) blocked direct fetch (403), and Publer/SocialPilot platform-list specifics weren't found in the sources retrieved — those figures rely on search-engine snippets rather than a fetched primary page, so treat them as lower-confidence than the Ayrshare/Postiz/Mixpost/Zernio numbers, which were confirmed via direct page fetch.

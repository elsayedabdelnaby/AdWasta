# Research OSS social scheduling tools

## Research Summary: OSS Social Media Scheduling/Publishing Platforms

*(Sources fetched directly — LICENSE files, GitHub repo pages, package.json, pricing/terms pages — not from memory.)*

### 1. Postiz (gitroomhq/postiz-app)

**License:** AGPL-3.0 (or later, at licensee's option), copyright Nevo David 2025. Confirmed by fetching the actual LICENSE file — [raw LICENSE](https://raw.githubusercontent.com/gitroomhq/postiz-app/main/LICENSE). It is the unmodified FSF AGPLv3 text with a Postiz-specific copyright header; **no Commons Clause, no "Enterprise Edition," and no anti-competing-hosted-service clause** was found in the LICENSE, README, or docs ([README](https://raw.githubusercontent.com/gitroomhq/postiz-app/main/README.md), [repo](https://github.com/gitroomhq/postiz-app)). Postiz explicitly states there is "no difference between the hosted version and the self-hosted version" — everything is under the same AGPL.

**Stack:** Confirmed via `package.json` ([raw](https://raw.githubusercontent.com/gitroomhq/postiz-app/main/package.json)): TypeScript monorepo, backend on **NestJS 11 + Prisma 6 + Postgres**, frontend **Next.js 16 + React 19**, Redis (ioredis) for caching/rate-limiting, Temporal.io for durable workflows, plus a Mastra/LangChain/Vercel-AI-SDK stack for AI features. GitHub language bar: TypeScript 75.9%, JS 13.5%, CSS 10% ([repo](https://github.com/gitroomhq/postiz-app)).

**Features/multi-tenancy:** Full scheduling + publishing to 30+ networks including Facebook, Instagram, X, LinkedIn, TikTok, Discord, Slack, Bluesky, etc. Has real multi-tenant structure — "organization workspaces," role-based team permissions, comment/approve workflows, and "agencies can manage multiple client workspaces from one installation," with data partitioned by Organization ([DeepWiki architecture summary](https://deepwiki.com/gitroomhq/postiz-app), corroborated by [issue #975](https://github.com/gitroomhq/postiz-app/issues/975) which discusses further multi-tenant token work).

**Embeddable vs standalone:** Standalone only. Its own docs point integrators to a **Public API** consumed over HTTP ("Looking to integrate with Postiz programmatically? Check out the Public API documentation") — it is not offered as an in-process Node library ([docs.postiz.com](https://docs.postiz.com)). Internal `@gitroom/*` packages exist but are private monorepo helpers, not a published embeddable SDK.

**Activity:** Very active. Latest release **v2.21.10, June 22, 2026**; **~33.4k GitHub stars, ~6.2k forks** as of fetch time ([repo](https://github.com/gitroomhq/postiz-app)).

**Verdict:** Feature-complete and closest architectural match to AdWasta (Node/TS, multi-tenant, real API adapters), but **AGPL-3.0 is a hard blocker for embedding/forking**: if AdWasta modified and ran Postiz's code as part of its own network-facing SaaS, §13 requires offering the *Corresponding Source of that modified version* to every tenant/user interacting with it remotely — effectively forcing AdWasta's fork to be open-sourced. Treating it as an arms-length HTTP dependency (calling an unmodified instance's API) avoids that trigger but reintroduces the "separate service you operate and pay for" overhead you're trying to avoid, and still means shipping tenant data through a GPL'd component you don't fully control the roadmap of.

---

### 2. Mixpost (inovector/mixpost)

**License:** The core **"Lite" package is MIT** — confirmed by fetching [raw LICENSE.md](https://raw.githubusercontent.com/inovector/mixpost/main/LICENSE.md), standard MIT text, copyright Dima Botezatu/Inovector 2022–present, no edition-specific carve-outs in the file itself. **Pro ($299 one-time)** and **Enterprise ($1,199 one-time)** are separate proprietary add-ons requiring a paid license code, governed by Inovector's [Terms of Use](https://mixpost.app/terms-of-use), which states verbatim: *"It is forbidden to use a Mixpost app Pro license to develop your own SaaS or to sell workspaces of Software License."* Enterprise is explicitly positioned as the tier "for building and monetizing a SaaS business," with Inovector stating it "reserves all rights to take legal action" against Pro users who attempt to build a competing SaaS ([mixpost.app/pricing](https://mixpost.app/pricing)).

**Stack:** Laravel/PHP confirmed — GitHub language bar: Vue 49.2%, PHP 44.1%, JS 5.2%, Blade 0.2% ([repo](https://github.com/inovector/mixpost)). Ships as a Composer/Laravel package or Docker container.

**Self-hosting/API/multi-tenancy:** Self-hostable, has a REST API — but **multi-tenant workspaces are Pro/Enterprise-only**; Lite is single-tenant with no API and no white-labeling ([pricing page](https://mixpost.app/pricing)).

**Activity:** **~3.4k stars, ~505 forks**; latest release **2.6.0**, confirmed **March 16, 2026** via the commit history (top commit "Update CHANGELOG," dated 2026) ([releases](https://github.com/inovector/mixpost/releases), [commits](https://github.com/inovector/mixpost/commits/main)) — roughly 4 months stale relative to the July 2026 research date, notably slower cadence than Postiz.

**Verdict:** MIT Lite is copyright-safe to fork, but functionally useless for AdWasta since it lacks multi-tenancy and the tier that has it (Pro) **contractually forbids exactly AdWasta's use case** (building a multi-tenant commercial SaaS); Enterprise removes that restriction but is a proprietary purchased license, not "reuse of OSS" — and it's PHP, off-stack anyway.

---

### 3. Other Node.js/TypeScript OSS Alternatives

No "Sprightly" project was found under that name in any search — likely not a real/identifiable OSS scheduler.

- **TryPost** (trypostit/trypost) — despite marketing copy mentioning an "AI copilot" and "MCP server," the actual repo is **PHP-dominant (76.5% PHP, 17.5% Vue, 3.9% TypeScript) on Laravel**, AGPL-3.0, ~398 stars, latest release v1.0.5 (June 26, 2026) ([repo](https://github.com/trypostit/trypost)). Not a Node/TS project despite appearances.
- **Bulkit.dev** (questpie/bulkit.dev) — genuinely TypeScript (99.5%), Apache-2.0 (permissive, no AGPL risk), but **archived by the owner on April 9, 2026 and now read-only** — i.e., dead ([repo](https://github.com/questpie/bulkit.dev)).
- **Shoutify** (TechSquidTV/Shoutify) — TypeScript/Next.js/Prisma/tRPC stack, but explicitly described as early-stage and "not yet functional" ([repo](https://github.com/TechSquidTV/Shoutify)); a separate, unrelated older `xaviranik/shoutify` repo is an unmaintained 2020-era class project, not the same tool.
- **Shoutrrr** (coollabsio/shoutrrr) — real project, Apache-2.0, but **PHP 55.4%/Laravel backend** with a TypeScript/React frontend, only ~191 stars, v1.2.0 as of July 2, 2026 ([repo](https://github.com/coollabsio/shoutrrr)) — again PHP-core, not Node/TS-native.
- **OPoster** — actually Java (Orienteer platform add-on), Apache-2.0, ~62 stars, not Node/TS ([repo](https://github.com/OrienteerBAP/OPoster)).

**Conclusion:** The OSS social-scheduler space is **overwhelmingly PHP/Laravel-dominated** (Mixpost, TryPost, Shoutrrr all Laravel+Vue). The only mature, actively-maintained, feature-complete Node/TypeScript-native project is **Postiz itself** — but it's AGPL-3.0. Every other TS candidate found is either not actually Node/TS-core (marketing claims vs. real language stats diverge repeatedly), archived/dead (Bulkit.dev), or pre-functional (Shoutify). There is no viable "permissively-licensed, actively-maintained, Node/TS, multi-tenant" scheduler to embed today — reinforcing that AdWasta's Playwright/Graph-API/X-API build-it-yourself path, or an AGPL-aware arms-length integration with Postiz's hosted API, are the realistic options rather than in-process embedding of any surveyed OSS project.

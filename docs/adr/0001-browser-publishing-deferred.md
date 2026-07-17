# ADR-001 — Browser (Playwright) publishing deferred post-v1

**Status:** Accepted — evidence file for the decision recorded inline at `design.md` §10.0
**Date:** 2026-07-17
**Relationship to `design.md` §10.0:** §10.0 records the *decision*. This file supplies the *evidence*, and **corrects one claim in it**.

---

## Why this file exists

`design.md` §10.0 (branch `fable5-reviewing`) already defers browser publishing and lists five reasons. Four are sound. The fifth — the reach premise — was rated "unverified" and supported by an unsourced claim. This file upgrades that reasoning from *unverified* to *refuted*, with primary sources, so the decision rests on evidence rather than assertion.

Research corpus: `docs/research/salvaged/` (25 primary-source reports). Full analysis: `docs/research/salvaged/reach-premise-and-tos-risk.md`.

---

## Correction to §10.0

> §10.0 currently states: *"The claim that API posts are penalized on organic reach is unverified; **Meta publicly denies it**."*

**"Meta publicly denies it" could not be sourced and should be removed.** We could not locate a single current, dated Meta/Instagram Newsroom or developer-blog post making that statement in 2023-2026. The "Facebook does not penalize third-party posting" claim circulates via marketing blogs citing it as established fact, never quoting a primary Meta statement.

The irony is that the sentence is *directionally right but backwards in its reasoning*: we don't need Meta to deny the penalty, because independent controlled tests already show there isn't one. Replace the claim with the evidence below.

The rest of §10.0 stands and is, if anything, understated.

---

## The reach premise: REFUTED (high confidence)

Every controlled test found shows API/third-party-published posts get **equal or higher** reach than native:

| Study | Method | Result |
|---|---|---|
| [Agorapulse Social Media Lab](https://www.agorapulse.com/social-media-lab/facebook-reach-3rd-party-app-impact/) | 3 FB Pages, 3 weeks, rotating native vs Buffer/Hootsuite/Agorapulse at fixed times | Third-party **+22.6%** reach. "Posting with 3rd party apps does NOT have any negative impact on Facebook Reach." |
| [Hootsuite](https://blog.hootsuite.com/experiment-third-party-scheduling-instagram/) | 1 week native vs 1 week scheduled | Scheduled higher: 8.19% vs 6.44% engagement; 10,122 vs 7,189 reach |
| [Social Status](https://www.socialstatus.io/does-hootsuite-buffer-cause-lower-reach-and-engagement/) | Roundup of a 2020 report | Third-party **+10.3%** engagement; "the algorithm treats them identically" |
| [CoSchedule](https://coschedule.com/blog/does-facebook-penalize-third-party-posts) | Nov-Dec 2017 study | "No significant difference" |

**Origin of the belief:** Facebook *did* under-distribute API-originated posts around 2011, then explicitly fixed it by adding "signals to detect good quality posting behavior" for third-party content. The folk wisdom outlived the mechanism by ~15 years.

**What actually moves reach** (the misattribution — §10.0's "reach differences come from content quality" is right): outbound links, video/image recompression on re-upload, off-peak timing, low early engagement velocity, post format. Publishers switching tools change caption, link, timing, and format simultaneously, then blame the tool.

### Honest limits

All four studies are **small-N and vendor-run** — the vendors sell scheduling tools and have an interest in the result. This is "no credible evidence of a penalty," **not** proof of absence. No peer-reviewed or platform-published study exists. The closest primary-adjacent signal is that Meta keeps *expanding* Instagram's Graph API publishing capability, which would be commercially irrational while degrading its reach.

This is why §10.0's revisit condition #1 ("measured, tenant-level data showing a meaningful reach penalty") is the right bar. It stays.

---

## ToS and ban risk — supporting detail

§10.0's "ToS violation" row is correct but coarse. The specifics matter, because they differ sharply by platform:

| Platform | Position | Source |
|---|---|---|
| **LinkedIn** | User Agreement §8.2 bans bots/automated methods to "create, comment on, like, share, or re-share posts." Covers posting on **your own account**, not just scraping. The clearest prohibition of the three. | [help.linkedin.com](https://www.linkedin.com/help/linkedin/answer/a1341387) |
| **Meta** | Automated Data Collection Terms ban automated access "regardless of whether... undertaken while logged-in to a Facebook account" — closes the "it's my own login" loophole. Framed around data *collection*, not posting. | [facebook.com/legal](https://www.facebook.com/legal/automated_data_collection_terms) |
| **X** | API-based scheduling of original content permitted with disclosure. Browser automation bypassing OAuth reportedly unauthorized — **unverified against primary text** (help.x.com returned 403). | — |

### The legal distinction that is usually botched

**Van Buren v. United States** (SCOTUS 2021) makes the CFAA a "gates up or down" test: automating access to an area you are authorized to enter (your own account, your own credentials) is not a CFAA violation. That removes **criminal** exposure — and it means the "ToS violation" framing should not be overstated into "illegal."

It does **not** remove contract exposure. **hiQ v. LinkedIn** is routinely cited as the scraper's win — hiQ won the *preliminary* CFAA round (9th Cir. 2022), but LinkedIn won on **breach of contract**: the December 2022 consent judgment imposed **$500,000 against hiQ**, a permanent injunction, and destruction of derived data. **LinkedIn won.**

Counter-example worth knowing: **Meta v. Bright Data** — Meta *lost* (Jan 2024; terms don't bar logged-off scraping of public data). **Meta v. Voyager Labs** involved 38,000+ *fake* accounts, not own-account posting. Litigation to date targets scraping-for-hire at scale, not single-account publishers.

**Which means §10.0's strongest argument is the one it already leads with: customer account risk.** A platform does not need to sue. It bans. That is a product decision with no appeal, and the banned asset belongs to the tenant. Legal exposure is the weaker argument; account destruction is the real one.

---

## Additional finding: the intended tool was wrong twice over

Playwright MCP was floated as the mechanism ("so the platform thinks it's a user"). It fails on both counts, which independently supports the deferral:

1. **Not for backend automation.** Microsoft's README steers coding agents away from MCP and states "Playwright MCP is **not** a security boundary." Maintainer Pavel Feldman rejected a backend-runtime-engine request with "This does not allow with our vision" ([issue #1352](https://github.com/microsoft/playwright-mcp/issues/1352)). It burns ~15k tokens of tool definitions before acting.
2. **Zero anti-detection.** It is stock Playwright — `navigator.webdriver`, the `Runtime.enable` CDP leak, and automation flags are all present. It is the *most* detectable option, not the least. Using it to look human would achieve the opposite.

This corroborates §10.0's "Playwright MCP is dev/QA only" rule from a second direction: it isn't merely *scoped* to QA, it is *unfit* for production publishing.

---

## If ever revisited (v2 reference)

§10.0's three revisit conditions all stand. If they are ever met, the correct shape is a **deterministic Playwright worker driven by BullMQ** — no MCP, no LLM per step. Login → compose → type → attach → post → confirm is a fixed script; an LLM deciding each click adds cost, latency, and nondeterminism to a flow that needs none.

Stealth stack, for the record:

| Option | License | Verdict |
|---|---|---|
| **Patchright** | Apache-2.0 | Actively maintained, Node-native. **But** a [31-site benchmark](https://ianlpaterson.com/blog/anti-detect-browser-benchmark-patchright-nodriver-curl-cffi/) scored 25 OK vs vanilla Playwright's 24 — a one-site gain. The author concluded real Chrome (`channel=chrome`) mattered more than the patches. |
| **Camoufox** | MPL-2.0 (PyPI wrapper MIT) | Architecturally best — C++-level Firefox patches via Juggler, no JS/CDP injection traces. But ~10-month maintenance gap in 2025, self-labels experimental, Python-first. |
| **rebrowser-patches** | Ambiguous (GitHub: none / npm: Apache-2.0) | **Reject.** Zero commits in 14+ months; own detection suite failing, unaddressed for a year. |

Stealth is an arms race with no finish line — a permanent maintenance line item, not a one-time build. **And LinkedIn is excluded permanently regardless**, per §8.2 of its User Agreement.

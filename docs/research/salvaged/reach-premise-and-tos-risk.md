# Reach premise & stealth-browser ToS risk

**Verdict: the "API posting kills reach" premise is REFUTED (high confidence).**

## Evidence against the premise

Every controlled test found shows API/third-party-published posts get equal or *higher* reach than native:

- **Agorapulse Social Media Lab** — 3 FB Pages, 3 weeks, rotating native vs Buffer/Hootsuite/Agorapulse at fixed times. Third-party posts beat native by ~22.6% reach. Explicit conclusion: "posting with 3rd party apps does NOT have any negative impact on Facebook Reach." https://www.agorapulse.com/social-media-lab/facebook-reach-3rd-party-app-impact/
- **Hootsuite A/B test** — scheduled posts had higher engagement rate (8.19% vs 6.44%) and reach (10,122 vs 7,189). https://blog.hootsuite.com/experiment-third-party-scheduling-instagram/
- **Social Status roundup** — cites a 2020 report finding third-party-scheduled FB posts got 10.3% *more* engagement; "the algorithm treats them identically." https://www.socialstatus.io/does-hootsuite-buffer-cause-lower-reach-and-engagement/
- **CoSchedule** — references a Nov-Dec 2017 study finding "no significant difference." https://coschedule.com/blog/does-facebook-penalize-third-party-posts

**Caveat (important):** all four are small-N and vendor-run. Directionally consistent, not laboratory-rigorous. But they all point the same way, and none found a tool-specific penalty.

## Historical origin of the belief

Facebook *did* under-distribute API-originated posts around 2011, then explicitly fixed it by adding "signals to detect good quality posting behavior" for third-party content. The folk wisdom outlived the mechanism by ~15 years.

**Could not verify:** a current (2023-2026) dated Meta primary-source statement saying "we don't penalize third-party posting." The claim circulates via marketing blogs. Closest primary-adjacent signal: Meta keeps *expanding* Instagram Graph API posting capability (collaborative posts, Reels insights) — commercially irrational if they were degrading API reach.

## Misattribution candidates (what actually moves reach)

Outbound links, video/image recompression on re-upload, off-peak timing, low early engagement velocity, post format. Publishers switching tools usually change caption/link/timing simultaneously, confounding the comparison.

## ToS / ban risk of stealth-browser posting

| Platform | Position | Source |
|---|---|---|
| **LinkedIn** | Clearest ban. User Agreement §8.2 prohibits bots/automated methods to "create, comment on, like, share, or re-share posts." Explicitly covers posting on your *own* account, not just scraping. | https://www.linkedin.com/help/linkedin/answer/a1341387 |
| **Meta** | Automated Data Collection Terms ban automated access "regardless of whether... undertaken while logged-in to a Facebook account" — closes the "it's my own login" loophole. Framed around data *collection*, not posting. | https://www.facebook.com/legal/automated_data_collection_terms |
| **X** | API-based scheduling of original content is permitted with disclosure. Browser automation bypassing OAuth reportedly unauthorized — *unverified against primary text* (help.x.com 403'd). | — |

### Litigation record

- **Meta v. Bright Data** — Meta **lost**. Jan 2024: terms don't bar logged-off scraping of public data. https://techcrunch.com/2024/01/24/court-rules-in-favor-of-a-web-scraper-bright-data-which-meta-had-used-and-then-sued/
- **hiQ v. LinkedIn** — commonly misreported. hiQ won the *preliminary* CFAA round (9th Cir. 2022), but LinkedIn won on **breach of contract**: Dec 2022 consent judgment = **$500,000 against hiQ**, permanent injunction, ordered destruction of derived data. **LinkedIn won.** https://www.privacyworld.blog/2022/12/linkedins-data-scraping-battle-with-hiq-labs-ends-with-proposed-judgment/
- **Meta v. Voyager Labs** — involved 38,000+ *fake* accounts. Not analogous to own-account posting.

### The legal distinction that matters

**Van Buren v. United States** (SCOTUS 2021) makes CFAA a "gates up or down" test — automating access to an area you're authorized to enter (your own account, your own credentials) is not a CFAA violation. https://www.jacksonlewis.com/insights/supreme-court-adopts-narrow-interpretation-computer-fraud-and-abuse-act

**But** that only removes *criminal* exposure. ToS violation remains enforceable as breach of contract (hiQ's $500K proves it) and — far more practically — as private platform enforcement: suspension, page ban, feature throttling. No lawsuit needed; it's a product decision, not a court case. Realistic consequence for a business automating its own account: **ban, not litigation**. Legal action has been reserved for scraping-for-hire at scale.

## Implication for the build

Reach is **not** a valid reason to prefer stealth-browser over official API. The three paths differ on risk, not reach:

- **copy_pack** — zero ToS risk, zero ban risk, no reach penalty. Costs human latency.
- **API publish** — no reach penalty, fully sanctioned, stable, the only path platforms are investing in. Costs onboarding/app-review friction.
- **stealth browser** — no reach upside to offset explicit LinkedIn ban risk and Meta's logged-in-automation clause.

**The API path dominates on every axis except onboarding friction. Stealth-browser automation buys nothing while adding ban risk.**

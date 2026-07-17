# Research nodriver and undetected-chromedriver

# Browser Automation Anti-Detection Tools: nodriver & undetected-chromedriver

Author confirmed: GitHub handle is **ultrafunkamsterdam** (repos owned by this account) — https://github.com/ultrafunkamsterdam/nodriver and https://github.com/ultrafunkamsterdam/undetected-chromedriver

## nodriver

**What it is**: A from-scratch async Python library for browser automation/scraping. Its own repo description states it is the "Successor of Undetected-Chromedriver," built to work around Captcha/Cloudflare/Imperva/hCaptcha (https://github.com/ultrafunkamsterdam/nodriver). The README explicitly calls it "the official successor of the Undetected-Chromedriver python package" and notes it is "fully asynchronous, contrary to undetected-chromedriver" (https://raw.githubusercontent.com/ultrafunkamsterdam/nodriver/main/README.md).

**Detection avoidance**: It "dropped selenium and chromedriver binary requirements, since this library communicates directly to the browser" via CDP — README states "No more webdriver, no more selenium," "No chromedriver binary or Selenium dependency," giving "even better resistance against web application firewalls (WAF's)" plus a performance boost from removing the Selenium wire-protocol layer (README, same URL; docs mirror at https://ultrafunkamsterdam.github.io/nodriver/readme.html). It also spins up a fresh browser profile each run and cleans up on exit to reduce fingerprint accumulation, and offers an `expert=True` mode that disables web security/origin-trials and forces shadow roots open (same doc).

**Maintenance (verified via GitHub API, checked 2026-07-17)**: created 2024-02-20; 4,526 stars, 425 forks, 14 open issues; last push **2026-05-13**, commit message "bugfixes, including cookies.set_all, save, load, fixed double connection object" (https://github.com/ultrafunkamsterdam/nodriver — API: `repos/ultrafunkamsterdam/nodriver`). Issue tracker is active and enabled (`has_issues: true`), with issues/PRs as recent as 2026-03-31 (e.g. #36, #35, #34, #33 "Chrome 146 cookie issue").

**PyPI** (package `nodriver`, https://pypi.org/pypi/nodriver/json): latest version **0.50.3**, uploaded **2026-05-13**; 43 releases total, with a steady 2025-2026 cadence: 0.46.1 (2025-05-16) → 0.47.0 (2025-07-06) → 0.48.0 (2025-10-29) → 0.48.1 (2025-11-09) → 0.50.1/0.50.2/0.50.3 (2026-05-11 to 05-13).

**License**: **AGPL-3.0** (GNU Affero GPL v3), confirmed via GitHub license API and PyPI license field (full AGPLv3 text embedded in package metadata).

## undetected-chromedriver

**What it is**: A patched Selenium ChromeDriver. Repo description: "Custom Selenium Chromedriver | Zero-Config | Passes ALL bot mitigation systems (like Distil / Imperva / Datadome / CloudFlare IUAM)" — it auto-downloads and patches the driver binary rather than stripping automation variables outright, aiming to "keep them, but prevent them from being injected in the first place" (https://raw.githubusercontent.com/ultrafunkamsterdam/undetected-chromedriver/master/README.md). Notably, the README itself warns: "THIS PACKAGE DOES NOT... hide your IP address, so when running from a datacenter... chances are large you will not pass" — a direct relevant caveat for server-side SaaS deployment.

**Deprecation status**: There is **no explicit deprecation banner or mention of nodriver anywhere in undetected-chromedriver's own README** (verified by full-text search of the raw README — zero hits for "nodriver"). The "successor" framing comes entirely from the nodriver side. However, strong practical signals of abandonment exist: the maintainer wrote in the README, "I will be putting limits on the issue tracker. It has been abused too long," redirecting users to a Discussions board instead. Confirmed via GitHub API: **`has_issues: false`** — the Issues tab is fully disabled on the repo (checked 2026-07-17), and direct issue URLs (e.g. issue #2249) now 404. The stale `open_issues_count: 1143` is a frozen artifact from before issues were shut off.

**Maintenance stats**: created 2019-12-22; 12,755 stars, 1,339 forks. Last GitHub commit: **2025-07-05**, a merge of community PR #2226 ("Refactor: Update for Python 3.13+ compatibility") — i.e., over a year with essentially one maintenance merge, and none since.

**PyPI** (https://pypi.org/pypi/undetected-chromedriver/json): latest published version is **3.5.5**, uploaded **2024-02-17** — meaning the pip-installable package has not been updated in roughly 2.5 years as of this report (2026-07-17), even though the 2025-07-05 GitHub commit post-dates it and was never released to PyPI.

**License**: **GPL-3.0**.

**Gap/caveat**: I could not pull specific 2024-2026 GitHub issues reporting live Cloudflare/DataDome bypass failures, because the issue tracker is disabled and the search API returns zero results against this repo. Search snippets did surface older issue titles tagged "[NODRIVER]" (e.g. #2249 "Getting detected by anti-bot when running on a VPS or headless," #2154, #2271, #2013, #1803) filed against the UC repo before issues were locked — these indicate nodriver-related bug reports were once funneled through the older repo, not confirmed detection-failure reports about UC itself specifically in 2025/2026.

## Verdict

**nodriver**: Actively maintained, production-viable for 2025-2026 (commits and PyPI releases through May 2026, live issue tracker). Architecturally sounder anti-detection story (no Selenium/WebDriver surface at all). Caveat: AGPL-3.0 is copyleft with a network-use clause — flag for legal review before embedding in closed-source SaaS.

**undetected-chromedriver**: Should be treated as **legacy/maintenance-mode**, not formally "deprecated" in writing, but functionally superseded — PyPI frozen since Feb 2024, GitHub commits reduced to a single 2025 PR merge, issue tracker disabled entirely. For a new SaaS build in 2026, nodriver is the better bet; UC is only defensible if you have an existing integration and no urgent need for anti-bot updates.

# Research browser-use, Stagehand, Browserbase MCP, Chrome DevTools MCP

# Research Findings: Browser Automation for Deterministic Publish-Worker vs. MCP/Agent Frameworks

## 1. browser-use (github.com/browser-use/browser-use)

**Positioning: primarily a Python library with an Agent-centric identity; MCP is an add-on integration mode, not its core identity.**
GitHub repo description (via `gh api repos/browser-use/browser-use`): *"🌐 Make websites accessible for AI agents. Automate tasks online with ease."* README opening line: *"Browser Use lets an AI agent use a web browser the same way you do — it opens pages, clicks buttons, types, and fills in forms. You describe the task, and it completes it."* (source: https://raw.githubusercontent.com/browser-use/browser-use/main/README.md). It never uses the literal phrase "agent framework," but the entire documented interface (`Agent(task=..., llm=...)`) is exactly that pattern.

**Embeddable as a plain library, code decides when to invoke it: Yes, confirmed.**
README section "Python library: the easiest way to automate the web": *"Want to automate the web at scale, from your own code, and with any LLM? Use the Python library"* with the pattern `agent = Agent(task="...", llm=ChatBrowserUse(...)); history = await agent.run()`. The FAQ explicitly contrasts this with MCP/CLI use: *"Use the Python library when you are building software that automates the web... Embed a browser agent into your own product... Repeatable automation in code → Python library."* (same README).

**It does ship its own MCP server, bundled in the same package.**
Docs page https://docs.browser-use.com/open-source/customize/integrations/mcp-server: *"Run browser-use as a local Model Context Protocol server. Connect AI models to browser automation through the MCP standard."* Purpose is explicitly "use browser-use from Claude Desktop/Cursor/Windsurf/Claude Code": setup is `uvx --from 'browser-use[cli]' browser-use --mcp`, with config snippets for each client. Confirmed via source: `pyproject.toml` lists `mcp==1.26.0` as a direct dependency of the main package (not a separate side project). The README top line even carries `<!-- mcp-name: com.browser-use/browser-use -->`, an MCP-registry marker.

**Is it fundamentally forced to call an LLM per step? No — but the documented/marketed path is LLM-per-step; deterministic control exists only at an undocumented, lower level.**
I cloned the repo (`git clone --depth 1`, version 0.13.6) and read the source directly, since this isn't covered in any README/docs page:
- `browser_use/browser/session.py` — `BrowserSession.get_current_page()` returns an internal `Page` object (not Playwright's — see caveat below).
- `browser_use/actor/page.py` — `Page` class exposes deterministic, no-LLM methods: `goto()`, `navigate()`, `press()`, `get_elements_by_css_selector()` — all pure CSS-selector-based, zero LLM calls.
- `browser_use/actor/element.py` — `Element` class exposes `click()`, `fill()`, `hover()`, `check()`, `select_option()`, `drag_to()` — again, plain deterministic calls.
- LLM is invoked only via the separate `get_element_by_prompt()`/`must_get_element_by_prompt()` natural-language helper, or the full `Agent` class.

So a login→compose→type→attach→click-post→confirm flow *can* be written deterministically against this actor API with no LLM call per step. **Flag: this is undocumented in the public README/docs I could access — found only by reading source. It appears to be an internal implementation layer, not a publicly promoted "no-LLM mode," so there's no stability guarantee and no official tutorial for this usage pattern.**

**Notable architectural finding, relevant to the Playwright decision itself:** as of `pyproject.toml` (v0.13.6), browser-use has **no Playwright dependency at all**. It depends on `cdp-use==1.4.5`, its own Chrome DevTools Protocol client, replacing what used to be Playwright-based internals. So browser-use is not "Playwright plus an agent loop" — it's a separate CDP stack.

---

## 2. Stagehand (github.com/browserbase/stagehand)

**What it is:** GitHub description: *"The SDK For Browser Agents."* README: *"Stagehand is a browser automation framework used to control web browsers with natural language and code. By combining the power of AI with the precision of code, Stagehand makes web automation flexible, maintainable, and actually reliable."* (source: raw README, https://raw.githubusercontent.com/browserbase/stagehand/main/README.md).

**Built directly on Playwright — confirmed explicitly.**
https://docs.stagehand.dev/v2/best-practices/playwright-interop: *"Stagehand is built on top of Playwright, so you can use Playwright methods directly through the Stagehand instance."* and *"`stagehand.page` and `stagehand.context` are instances of Playwright's `Page` and `BrowserContext` respectively."*

**Mixing raw Playwright calls with AI-driven act()/observe()/extract() in the same script — confirmed, with actual code.**
From the same docs page:
```typescript
const page = stagehand.page;
// Base Playwright methods work
await page.goto("https://github.com/browserbase/stagehand");
// Stagehand overrides Playwright objects
await page.act("click on the contributors")
```
The README's own example does the same thing: `const page = stagehand.context.pages()[0]; await page.goto(...)` (plain Playwright) followed by `stagehand.act(...)`, `agent.execute(...)`, `stagehand.extract(...)` (AI-driven) in one script. README explicitly frames the philosophy: *"Choose when to write code vs. natural language: use AI when you want to navigate unfamiliar pages, and use code when you know exactly what you want to do."* and *"Write once, run forever: Stagehand's auto-caching combined with self-healing remembers previous actions, runs without LLM inference, and knows when to involve AI whenever the website changes."*

**Usable as a plain SDK with zero LLM involvement for a given run — plausible but NOT explicitly confirmed in docs; flagged as unverified.**
Since `stagehand.page` is a literal Playwright `Page`, a script using only `page.goto()`/`page.click()`/`page.fill()` (no `act`/`observe`/`extract`/`agent` calls) would structurally need no LLM call. However, no fetched doc explicitly states "Stagehand can run with zero LLM configured." Setup guidance instead says: *"Stagehand is best when you have an API key for an LLM provider and Browserbase credentials"* (README) — a recommendation, not a hard requirement statement either way. **Recommend empirically testing instantiation without any LLM API key before relying on this for the architecture decision.**

**Browserbase does offer an MCP wrapper** — see #3 below; it is a separate repo/package from the Stagehand SDK itself.

---

## 3. Browserbase MCP server — correct repo is `browserbase/mcp-server-browserbase`, not `browserbase/mcp-server`

**Naming correction:** `gh api repos/browserbase/mcp-server` returned `404 Not Found`. The actual repo is **`browserbase/mcp-server-browserbase`** (confirmed via `gh api repos/browserbase/mcp-server-browserbase`).

**Purpose:** GitHub description: *"Allow LLMs to control a browser with Browserbase and Stagehand."* README (fetched from https://github.com/browserbase/mcp-server-browserbase): *"This server provides cloud browser automation capabilities using Browserbase and Stagehand. It enables LLMs to interact with web pages, extract information, and perform automated actions."* It exposes MCP tools reported as `start`, `end`, `navigate`, `act`, `observe`, `extract`, available as a hosted SHTTP service or self-hosted STDIO option, defaulting to Gemini 2.5 Flash Lite as the model powering Stagehand's `act`/`extract` reasoning (configurable to Claude/GPT-4o). **Flag:** the specific tool list and hosting-mode details came from the WebFetch summarizer rather than a raw-markdown re-verification by me; the core purpose claim is independently corroborated by the GitHub API's `description` field, which I do trust fully.

**Confirmed different from Stagehand itself:** yes — this is a distinct repo that wraps the Stagehand SDK plus Browserbase's cloud/headless browser infrastructure behind an MCP transport, so an MCP client (e.g., Claude Desktop) can drive a cloud browser. Stagehand itself is the underlying library you'd embed directly in your own backend code without any MCP layer; this repo is the "expose it to an MCP client" wrapper, analogous in role to browser-use's `--mcp` flag but shipped as its own dedicated package.

---

## 4. Chrome DevTools MCP (github.com/ChromeDevTools/chrome-devtools-mcp)

**It exists, and it's official** (ChromeDevTools GitHub org). GitHub description: *"Chrome DevTools for coding agents."* (homepage listed: npmjs.org/package/chrome-devtools-mcp).

**Stated purpose — developer debugging/performance profiling, not content-posting automation.**
README (https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/README.md, fetched): *"lets your coding agent (such as Antigravity, Claude, Cursor or Copilot) control and inspect a live Chrome browser. It acts as a Model-Context-Protocol (MCP) server, giving your AI coding assistant access to the full power of Chrome DevTools for reliable automation, in-depth debugging, and performance analysis."* Key features cited: *"Get performance insights: Uses Chrome DevTools to record traces and extract actionable performance insights"* and *"Advanced browser debugging: Analyze network requests, take screenshots and check browser console messages."*

**Nuance/flag:** its tool reference (https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) does include generic automation primitives under an "Input Automation" category — `click`, `fill`, `fill_form`, `hover`, `type_text`, `upload_file`, `drag`, `press_key` — and states *"Reliable automation: Uses puppeteer to automate actions in Chrome and automatically wait for action results."* So it is technically capable of driving a login/compose/attach/post sequence, but it is positioned and marketed entirely around debugging/performance/network inspection during development, not as a production content-publishing tool. It uses **Puppeteer**, not Playwright, under the hood.

---

## Summary of flags / things not fully verified

1. Stagehand running with zero LLM configured for a pure-Playwright-only script — plausible from architecture (`stagehand.page` is a real Playwright Page) but not explicitly stated in any doc I fetched; verify empirically.
2. browser-use's deterministic actor-layer API (`BrowserSession`/`Page`/`Element` with `click()`/`fill()`/`goto()`) is real (verified directly in source at v0.13.6) but **undocumented** in the public README/docs — no official guidance or stability guarantee for using it without the `Agent`/LLM loop.
3. `mcp-server-browserbase`'s exact tool list and SHTTP/STDIO hosting details came from a summarizing fetch, not a raw-markdown re-check by me; the top-level purpose claim is independently corroborated via GitHub's own repo description field.
4. The task's assumed repo name `browserbase/mcp-server` does not exist (404) — correct name is `browserbase/mcp-server-browserbase`.

Local artifacts from this research (raw READMEs, shallow clone) are in the scratchpad at `/private/tmp/claude-501/-Users-ahmedhany-Projects-AdWasta/cbb74275-b808-424e-8d6a-d1dfc3005cf5/scratchpad/` (`stagehand_readme.md`, `browseruse_readme.md`, `browser-use-src/`) if you want me to pull further quotes or inspect more source files.

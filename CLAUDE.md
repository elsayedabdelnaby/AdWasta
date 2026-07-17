# AdWasta — Claude Code instructions

## Project

Multi-tenant AdWasta: Supervised Crew — ten arms, five pillars, one Brain.

Read `docs/design.md` before architectural changes.
Follow `docs/implementation-plan.md` phase order.
`docs/adr/` holds binding decisions — they override anything older in the specs.

## Workflow — the completion gate

One phase per context. `docs/phase-prompt.md` is the ready-made prompt.

1. **Plan and slice** the phase from `docs/implementation-plan.md`
2. **Pressure-test** the slice against `docs/design.md`, `docs/adr/`, and the
   non-negotiables below. Contradiction or ambiguity ⇒ stop and ask, never guess
3. **Implement test-first** — `superpowers:test-driven-development`. Every plan
   checkbox that says "test:" is required, not optional
4. **Completion gate — all four, in order:**
   - `superpowers:verification-before-completion` — run the commands, paste real
     output; never call a failure a pass
   - `npm test` green + `npm run build` clean
   - the phase's own gate line from the plan, exercised for real
   - `/code-review` on the diff — fix real findings, report skipped ones
5. **Stop and report.** Do not start the next phase. Ask before pushing.

UI phases additionally use the `verify` skill (Playwright MCP — QA only, per ADR-001).

## Non-negotiables

- Every table and query is scoped by `tenant_id` **and** protected by Postgres RLS
- **Every route authenticates; `tenant_id` comes from the session, never a path param** (ADR-002, design §7.2) — RLS without auth is a lock with no door
- No publish or comment/DM reply without approval
- Default publish mode is `copy_pack`; official API adapters require explicit tenant enable
- **Browser publishing is deferred post-v1 (ADR-001, design §10.0) — do not implement it.** Playwright MCP is for QA/demos only
- Competitor intel uses ToS-safe sources only (design §12) — never login-gated social scraping
- Trend/competitor intel: **hourly Tier-0 watch never calls an LLM**; Tier-1 analysis runs only on detected change (ADR-003, design §12.3)
- API adapters are scaffolded early; activation is config + credentials only
- Email sends require suppression-list gate + unsubscribe + consent attestation (design §21)
- LLM never computes performance stats; the Analyst arm only interprets `src/metrics/` output
- Respect release gates: R1 validation slice before R2/R3 (design §23)
- Never commit credentials or `.env`

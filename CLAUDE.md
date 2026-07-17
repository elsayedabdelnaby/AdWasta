# AdWasta — Claude Code instructions

@AGENTS.md

## Project

Multi-tenant AdWasta: Supervised Crew — ten arms, five pillars, one Brain.

Read `docs/design.md` before architectural changes.
Follow `docs/implementation-plan.md` phase order.

## Workflow

For any non-trivial implementation phase, use the `ship-loop` skill from `../skills/ship-loop/SKILL.md`:

1. Plan and slice the phase
2. Grill the plan against `docs/design.md` and tenant domain rules
3. Implement
4. Run completion gate: verify → simplify → independent review → structure review → runtime smoke → commit

## Non-negotiables

- Every table and query is scoped by `tenant_id` **and** protected by Postgres RLS
- No publish or comment/DM reply without approval
- Default publish mode is `copy_pack`; official API adapters require explicit tenant enable
- **Browser publishing is deferred post-v1 (ADR-001, design §10.0) — do not implement it.** Playwright MCP is for QA/demos only
- Competitor intel uses ToS-safe sources only (design §12) — never login-gated social scraping
- API adapters are scaffolded early; activation is config + credentials only
- Email sends require suppression-list gate + unsubscribe + consent attestation (design §21)
- LLM never computes performance stats; the Analyst arm only interprets `src/metrics/` output
- Respect release gates: R1 validation slice before R2/R3 (design §23)
- Never commit credentials or `.env`

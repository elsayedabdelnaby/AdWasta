# Marketing Agent — Claude Code instructions

@AGENTS.md

## Project

Multi-tenant marketing agent: Eight Arms, One Brain.

Read `docs/design.md` before architectural changes.
Follow `docs/implementation-plan.md` phase order.

## Workflow

For any non-trivial implementation phase, use the `ship-loop` skill from `../skills/ship-loop/SKILL.md`:

1. Plan and slice the phase
2. Grill the plan against `docs/design.md` and tenant domain rules
3. Implement
4. Run completion gate: verify → simplify → independent review → structure review → runtime smoke → commit

## Non-negotiables

- Every table and query is scoped by `tenant_id`
- No publish or comment reply without approval
- Default publish mode is `copy_pack`; browser and API require explicit tenant enable
- API adapters are scaffolded early; activation is config + credentials only
- Never commit credentials or `.env`

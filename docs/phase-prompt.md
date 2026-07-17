# Phase execution prompt

Paste the block below into a **fresh context**, replacing `<N>` with the phase number.
Run **one phase per context.** Clear between phases.

**Phase order (12 buildable):** `0 → 0.5 → 1 → 2 → 3 → 3.5` (R1) → `4 → 5 → 6 → 9 → 10` (R2) → `8` (R3).
**Phase 7 is deferred — never build it** (ADR-001).

---

## The prompt

```
Implement Phase <N> of AdWasta. One phase only — stop at the gate.

## Read first (do not skip, do not work from memory)
- docs/implementation-plan.md — find "## Phase <N>", read every task in it
- docs/design.md — the sections that phase's tasks reference
- docs/adr/0001, 0002, 0003 — binding decisions; they override anything older
- CLAUDE.md — non-negotiables

Note: CLAUDE.md references `../skills/ship-loop/SKILL.md` and `@AGENTS.md`. Both are
MISSING from this repo. Ignore those references; this prompt replaces them. Do not
invent a ship-loop skill and do not stop to look for it.

## Non-negotiables (violating any = phase fails)
- Every table has tenant_id AND a Postgres RLS policy on app.tenant_id
- Every route authenticates; tenant_id comes from the SESSION, never a path param
- No publish/reply without explicit approval
- copy_pack is the only live publish path; api/browser are scaffolded stubs only
- Browser publishing: do not implement, do not scaffold beyond the reserved flag
- Hourly Tier-0 intel watch must never call an LLM
- Competitor intel: ToS-safe sources only; never login-gated scraping
- Analyst arm never computes stats — it interprets src/metrics/ output
- Never commit credentials or .env

## How to work
1. **Plan the slice.** List the phase's tasks as todos. If anything in the plan is
   ambiguous, contradicts an ADR, or looks wrong — STOP and ask me. Do not guess.
2. **TDD, strictly.** Use the superpowers:test-driven-development skill. For each task:
   write the failing test first, watch it fail, then implement until green.
   Every checkbox in the plan that says "test:" is a required test, not a suggestion.
   Cover the negative cases the plan names explicitly (401 unauthenticated,
   403 non-member, cross-tenant read returns zero rows, 24 unchanged polls = zero
   LLM calls, step cap enforced, HIGH risk blocked without approval).
3. **Implement** the tasks in plan order.
4. **Verify before claiming done.** Use superpowers:verification-before-completion.
   Run the real commands and paste real output:
   - npm test        (all green — not "should pass")
   - npm run build   (typecheck clean)
   - the phase's own gate line from the plan, exercised for real
   Do not claim anything passes without showing the output. If something fails,
   fix it or tell me it's failing — never describe a failure as a pass.
5. **Review.** Run /code-review on the diff. Fix real findings; tell me which you
   skipped and why.
6. **Report and STOP.** Do not start the next phase.

## Report format
- Gate: PASS or FAIL (with the actual command output)
- Tasks completed / tasks skipped (and why)
- Tests added: what they prove, especially the negative cases
- Anything in the plan that turned out wrong, unclear, or that you had to
  deviate from — I want this even if the phase passed
- Commit made? (yes/no — ask me before pushing)

Begin by reading the docs and listing the phase's tasks as todos.
```

---

## Notes

**Why not `ship-loop`:** the skill and its directory don't exist in this repo. The prompt
above inlines an equivalent gate (plan → TDD → implement → verify → review → stop) using
skills that do exist. If you later add `../skills/ship-loop/SKILL.md`, replace the
"How to work" section with an invocation of it.

**Why one phase per context:** each phase is large, and the plan is ~1,200 lines. Loading
the whole thing plus prior phases' code crowds out the actual work. Phase gates exist so
you can clear between them.

**Phase 0 is special.** It has no code to build on, and it carries the auth work (Task
0.3a) that everything else depends on. Expect it to take the longest, and do not let it
end without the 401/403 tests passing.

**Before R2:** stop. R1's exit criterion is a real tenant approving content weekly for
2+ weeks and saying they'd pay. That's a business gate, not a code gate — no prompt
satisfies it. Everything in R2/R3 is worthless if R1's answer is no (design §23).

# ADR-004 — Campaign pipeline: hand-rolled durable state machine (supersedes ADR-002 Decision 3)

**Status:** Accepted — owner-confirmed 2026-07-18 during Phase 0.5
**Supersedes:** ADR-002 Decision 3 (adopt Mastra for workflows + HITL suspend/resume)
**Depends on:** the multi-tenant + RLS model (design §7, non-negotiable #1)

---

## Context

ADR-002 Decision 3 adopted **Mastra** (Apache-2.0) for the campaign pipeline's
workflow engine + HITL `suspend()`/`resume()` + durable state, on the reasoning
that it hands us the hardest part (a durable suspend/resume engine) for free. The
required pre-work was to "audit which features are `ee/`-gated; if the approval
primitives are EE, fall back to hand-rolled and revisit."

During Phase 0.5 implementation that audit ran, and found:

1. **Not EE-gated.** `@mastra/core` is Apache-2.0; workflows + suspend/resume are
   in the core. On the EE test alone, Mastra passes.
2. **But durability conflicts with our RLS non-negotiable.** Mastra's durability
   comes from a persistent storage adapter (e.g. `@mastra/pg`) whose tables
   (`mastra_workflow_snapshot`, …) are one domain of a ~100-domain platform store.
   That storage is managed on Mastra's own connection pool with no hook to run
   each write through our `withTenant` / `app.tenant_id`. So tenant workflow-state
   would live **outside our Row-Level Security**, violating non-negotiable #1
   ("every table has `tenant_id` AND a Postgres RLS policy"). Reconciling this
   means either reimplementing Mastra's enormous storage interface as an RLS-aware
   adapter (impractical) or waiving RLS for Mastra's tables (a real security-model
   exception).

The owner considered per-client single-tenant deployment (which would moot RLS)
and rejected it: the product targets many small SMBs at a low price point, where
server-per-client breaks the §6.1 unit economics, and a multi-tenant+RLS app can
still be deployed one-tenant-per-instance later for free.

## Decision

**Hand-roll the durable pipeline on our existing RLS Postgres.** A tenant-scoped
`campaign_runs` table (status, current_step, per-step `ArmResult`s, suspend/resume
data) driven through RESEARCH → STRATEGY → CREATION, suspending before OPS and
resuming after human approval. State is in our DB, so a resume works after a
process restart. Drop the Mastra dependency.

- Suspend/resume is a guarded state transition (atomic `UPDATE … WHERE status =
  'suspended'`), which is also the approval inbox (Task 3.5 reads suspended runs).
- The Supervisor (`src/brain/supervisor.ts`) routes only — no LLM to redo
  specialist output. Each stage persists its `ArmResult`; the next crew reads from
  the DB.

## Consequences

- Non-negotiable #1 holds: every table, including pipeline state, is under RLS.
- One fewer heavy, fast-churning dependency (Mastra shipped 1,396 npm versions).
- We own the suspend/resume engine — the exact thing ADR-002 hoped to avoid — but
  it is small because our Postgres already provides durability; the "hardest win"
  Mastra offered is trivial in our context.
- ADR-002 Decision 3's Mastra adoption is **reversed**. If a future need (complex
  branching workflows, time-travel) outgrows the hand-rolled machine, revisit —
  but only behind an RLS-compatible persistence story.

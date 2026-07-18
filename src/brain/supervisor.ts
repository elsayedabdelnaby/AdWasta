// The Brain supervisor routes a campaign through crews (design §1.2). It ROUTES
// ONLY — it never calls an LLM to redo a specialist's work. Hence this module has
// no LlmClient dependency by design; it is pure control flow.

export type PipelineStage = 'research' | 'strategy' | 'creation';
export type PipelineStep = PipelineStage | 'awaiting_approval' | 'ops' | 'done';

/** The sequential campaign pipeline before the human approval gate. */
export const PIPELINE_ORDER: readonly PipelineStage[] = ['research', 'strategy', 'creation'] as const;

/**
 * Given the current step, return the next. RESEARCH → STRATEGY → CREATION →
 * (suspend for approval) → OPS → done. Enforces order: STRATEGY can never run
 * before RESEARCH because the only path to it is through this table.
 */
export function nextStep(current: PipelineStep): PipelineStep {
  switch (current) {
    case 'research':
      return 'strategy';
    case 'strategy':
      return 'creation';
    case 'creation':
      return 'awaiting_approval'; // suspend before OPS
    case 'awaiting_approval':
      return 'ops'; // only after approval resumes
    case 'ops':
      return 'done';
    case 'done':
      return 'done';
  }
}

/** The crew whose ArmResult a given stage must already have on the DB. */
export function prerequisiteStage(stage: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_ORDER.indexOf(stage);
  return idx <= 0 ? null : PIPELINE_ORDER[idx - 1]!;
}

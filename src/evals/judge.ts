import { z } from 'zod';
import type { LlmClient, StepSink } from '../llm/openrouter.js';
import { routeModel, type ModelTiers } from '../config/model-routing.js';

export const JudgeSchema = z.object({ score: z.number().min(0).max(1), reason: z.string() });
export const JUDGE_PASS = 0.7;

export interface JudgeVerdict {
  score: number;
  pass: boolean;
  reason: string;
}

/**
 * LLM-as-judge (design §17, Task 10.2). ALWAYS uses MODEL_DEEP, and is a SEPARATE
 * call from the producer (different function, different tier) — a judge must never
 * share the producer's context or model. Advisory until ≥25 fixtures exist.
 */
export async function judgeOutput(
  deps: { llm: LlmClient; models: ModelTiers; trace?: StepSink },
  args: { output: string; criteria: string },
): Promise<JudgeVerdict> {
  const res = await deps.llm.structuredComplete({
    model: routeModel('deep', deps.models), // deep tier, never the producer's
    schema: JudgeSchema,
    trace: deps.trace,
    messages: [
      { role: 'system', content: 'You are an impartial evaluator. Score from 0 to 1 how well the OUTPUT meets the CRITERIA. Be strict. Return JSON {score, reason}.' },
      { role: 'user', content: `Criteria: ${args.criteria}\n\nOutput:\n${args.output}` },
    ],
  });
  return { score: res.score, pass: res.score >= JUDGE_PASS, reason: res.reason };
}

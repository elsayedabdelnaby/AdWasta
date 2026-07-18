import { classifyError } from './error-handler.js';
import type { StepSink } from '../llm/openrouter.js';

export const MAX_ARM_STEPS = 10;

export type ReactAction =
  | { type: 'tool'; tool: string; args: unknown }
  | { type: 'final'; result: unknown };

export interface ReactStep {
  action: Extract<ReactAction, { type: 'tool' }>;
  observation: unknown;
}

export interface RunReactOptions {
  /** The policy (LLM-backed in production, injected in tests) that picks the next action. */
  decide: (ctx: { steps: ReactStep[] }) => Promise<ReactAction>;
  tools: Record<string, (args: unknown) => Promise<unknown>>;
  maxSteps?: number;
  trace?: StepSink;
  sleep?: (ms: number) => Promise<void>;
}

export interface ReactRunResult {
  result: unknown;
  steps: ReactStep[];
  stoppedAtCap: boolean;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Think-Act-Observe loop shell (design §3, Task 0.5.2). The policy proposes an
 * action; tools execute; observations feed back in. Hard-capped at MAX_ARM_STEPS.
 * Tool errors follow the taxonomy (design §15): transient → retry (max 2);
 * LLM-recoverable → returned as an observation; user-fixable/unexpected → bubble.
 */
export async function runReactLoop(opts: RunReactOptions): Promise<ReactRunResult> {
  const maxSteps = opts.maxSteps ?? MAX_ARM_STEPS;
  const sleep = opts.sleep ?? defaultSleep;
  const steps: ReactStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const action = await opts.decide({ steps });
    if (action.type === 'final') {
      return { result: action.result, steps, stoppedAtCap: false };
    }

    const observation = await executeTool(opts.tools, action.tool, action.args, sleep);
    steps.push({ action, observation });
    await opts.trace?.addStep({ action: `tool.${action.tool}`, tool: action.tool });
  }

  return { result: null, steps, stoppedAtCap: true };
}

async function executeTool(
  tools: RunReactOptions['tools'],
  name: string,
  args: unknown,
  sleep: (ms: number) => Promise<void>,
  maxRetries = 2,
): Promise<unknown> {
  const tool = tools[name];
  if (!tool) return { error: `unknown tool: ${name}` };

  let attempt = 0;
  for (;;) {
    try {
      return await tool(args);
    } catch (err) {
      const classified = classifyError(err);
      if (classified.errorClass === 'transient' && attempt < maxRetries) {
        attempt += 1;
        await sleep(2 ** attempt * 100);
        continue;
      }
      if (classified.errorClass === 'llm_recoverable') {
        // Feed the error back to the model as an observation to self-correct.
        return { error: classified.message };
      }
      throw classified; // user_fixable / unexpected / exhausted transient
    }
  }
}

import type { MemoryTurn } from './types.js';

export const COMPACTION_THRESHOLD = 20;
export const KEEP_RECENT = 10;

export type Summarizer = (turns: MemoryTurn[]) => Promise<string>;

/**
 * Compact a short-term buffer (design §5): once it exceeds ~20 turns, summarize
 * everything older than the last 10 with a cheap model, but preserve
 * decision/approval turns verbatim (never compacted away).
 */
export async function compactTurns(
  turns: MemoryTurn[],
  summarize: Summarizer,
): Promise<MemoryTurn[]> {
  if (turns.length <= COMPACTION_THRESHOLD) return turns;

  const older = turns.slice(0, turns.length - KEEP_RECENT);
  const recent = turns.slice(-KEEP_RECENT);
  const preserved = older.filter((t) => t.kind === 'decision' || t.kind === 'approval');
  const summary = await summarize(older);

  return [{ role: 'system', kind: 'summary', content: summary }, ...preserved, ...recent];
}

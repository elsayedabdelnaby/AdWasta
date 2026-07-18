import { describe, it, expect, vi } from 'vitest';
import { compactTurns, COMPACTION_THRESHOLD, KEEP_RECENT } from './compaction.js';
import type { MemoryTurn } from './types.js';

const msg = (i: number, kind?: MemoryTurn['kind']): MemoryTurn => ({
  role: 'user',
  content: `turn ${i}`,
  kind,
});

describe('compactTurns (design §5)', () => {
  it('leaves a buffer at or under the threshold untouched', async () => {
    const turns = Array.from({ length: COMPACTION_THRESHOLD }, (_, i) => msg(i));
    const summarize = vi.fn(async () => 'summary');
    expect(await compactTurns(turns, summarize)).toBe(turns);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('summarizes older turns and keeps the last N verbatim', async () => {
    const turns = Array.from({ length: 25 }, (_, i) => msg(i));
    const summarize = vi.fn(async () => 'SUMMARY');
    const out = await compactTurns(turns, summarize);

    // summarize saw the older turns (all but the last KEEP_RECENT)
    expect(summarize).toHaveBeenCalledWith(turns.slice(0, 25 - KEEP_RECENT));
    // result = 1 summary + last KEEP_RECENT
    expect(out).toHaveLength(1 + KEEP_RECENT);
    expect(out[0]).toMatchObject({ kind: 'summary', content: 'SUMMARY' });
    expect(out.at(-1)!.content).toBe('turn 24');
  });

  it('never compacts away decision/approval turns from the older window', async () => {
    const turns = Array.from({ length: 25 }, (_, i) =>
      i === 3 ? msg(i, 'decision') : i === 4 ? msg(i, 'approval') : msg(i),
    );
    const out = await compactTurns(turns, async () => 'S');
    const preserved = out.filter((t) => t.kind === 'decision' || t.kind === 'approval');
    expect(preserved).toHaveLength(2);
  });
});

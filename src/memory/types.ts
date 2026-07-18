// Four memory timescales (design §5), all tenant-scoped.
export type MemoryType = 'short_term' | 'working' | 'long_term' | 'episodic';

export interface MemoryTurn {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  // 'decision'/'approval' turns are preserved verbatim through compaction.
  kind?: 'message' | 'observation' | 'decision' | 'approval' | 'summary';
}

export type WorkingMemory = Record<string, unknown>;

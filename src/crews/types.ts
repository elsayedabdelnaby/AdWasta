import type { ArmId } from '../harness/types.js';

export type CrewId = 'research' | 'strategy' | 'creation' | 'ops' | 'measure';

// UI-facing persona per crew (design §1.2 roster).
export type Persona = 'Alex' | 'Sam' | 'Jordan' | 'Ops' | 'Riley';

export interface CrewMeta {
  crew: CrewId;
  persona: Persona;
  arms: ArmId[];
}

import type { ArmId } from '../harness/types.js';
import type { CrewId, CrewMeta, Persona } from './types.js';

// Crew → persona + arms (design §1.2). Used for trace/UI attribution.
export const ROSTER: Record<CrewId, CrewMeta> = {
  research: { crew: 'research', persona: 'Alex', arms: ['market', 'trends', 'competitors'] },
  strategy: { crew: 'strategy', persona: 'Sam', arms: ['strategy'] },
  creation: { crew: 'creation', persona: 'Jordan', arms: ['content'] },
  ops: { crew: 'ops', persona: 'Ops', arms: ['daily_strategist', 'scheduler', 'engagement', 'publisher'] },
  measure: { crew: 'measure', persona: 'Riley', arms: ['analyst'] },
};

const ARM_TO_CREW: Record<ArmId, CrewId> = (() => {
  const map = {} as Record<ArmId, CrewId>;
  for (const meta of Object.values(ROSTER)) {
    for (const arm of meta.arms) map[arm] = meta.crew;
  }
  return map;
})();

export function crewForArm(arm: ArmId): CrewId {
  return ARM_TO_CREW[arm];
}

export function personaForArm(arm: ArmId): Persona {
  return ROSTER[crewForArm(arm)].persona;
}

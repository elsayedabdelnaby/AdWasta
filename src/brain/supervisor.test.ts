import { describe, it, expect } from 'vitest';
import { nextStep, prerequisiteStage, PIPELINE_ORDER } from './supervisor.js';
import { crewForArm, personaForArm } from '../crews/roster.js';

describe('supervisor routing (design §1.2 — route only, no LLM)', () => {
  it('routes RESEARCH → STRATEGY → CREATION → approval → OPS → done', () => {
    expect(nextStep('research')).toBe('strategy');
    expect(nextStep('strategy')).toBe('creation');
    expect(nextStep('creation')).toBe('awaiting_approval');
    expect(nextStep('awaiting_approval')).toBe('ops');
    expect(nextStep('ops')).toBe('done');
    expect(nextStep('done')).toBe('done');
  });

  it('encodes prerequisites so a stage cannot skip its predecessor', () => {
    expect(prerequisiteStage('research')).toBeNull();
    expect(prerequisiteStage('strategy')).toBe('research');
    expect(prerequisiteStage('creation')).toBe('strategy');
    expect(PIPELINE_ORDER).toEqual(['research', 'strategy', 'creation']);
  });
});

describe('crew roster', () => {
  it('maps arms to their crew persona', () => {
    expect(personaForArm('market')).toBe('Alex');
    expect(personaForArm('strategy')).toBe('Sam');
    expect(personaForArm('content')).toBe('Jordan');
    expect(personaForArm('analyst')).toBe('Riley');
    expect(crewForArm('competitors')).toBe('research');
  });
});

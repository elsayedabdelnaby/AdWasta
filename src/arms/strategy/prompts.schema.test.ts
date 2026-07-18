import { describe, it, expect } from 'vitest';
import { ICPSchema, AnglesSchema, PlanSchema } from './prompts.js';

describe('strategy schemas tolerate model enum casing', () => {
  it('accepts "B2C" and normalizes to "b2c"', () => {
    const out = ICPSchema.parse({
      audienceModel: 'B2C',
      segments: ['families'],
      triggers: ['ramadan'],
      objections: ['price'],
      summary: 'gift buyers',
    });
    expect(out.audienceModel).toBe('b2c');
  });

  it('accepts "Social" / "Email" channels and normalizes them', () => {
    const out = AnglesSchema.parse({
      angles: [
        { channel: 'Social', angle: 'a', hooks: [], proofPoints: [] },
        { channel: 'EMAIL', angle: 'b', hooks: [], proofPoints: [] },
        { channel: 'social', angle: 'c', hooks: [], proofPoints: [] },
      ],
    });
    expect(out.angles.map((a) => a.channel)).toEqual(['social', 'email', 'social']);
  });

  it('accepts KPI class casing variants', () => {
    const out = PlanSchema.parse({
      horizonDays: 90,
      channels: ['social', 'email'],
      themes: ['heritage'],
      kpis: [{ name: 'reach', class: 'Awareness' }],
    });
    expect(out.kpis[0]!.class).toBe('awareness');
  });

  it('still rejects values outside the enum', () => {
    expect(() =>
      ICPSchema.parse({ audienceModel: 'b2g', segments: ['x'], triggers: [], objections: [], summary: 's' }),
    ).toThrow();
  });
});

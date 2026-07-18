import { describe, it, expect } from 'vitest';
import { buildContentMessages, languageName } from './prompts.js';

describe('languageName', () => {
  it('maps locale codes to language names', () => {
    expect(languageName('ar')).toBe('Arabic');
    expect(languageName('AR-EG')).toBe('Arabic');
    expect(languageName('fr')).toBe('French');
  });

  it('passes unknown values through as-is', () => {
    expect(languageName('Arabic')).toBe('Arabic');
    expect(languageName('Egyptian Arabic')).toBe('Egyptian Arabic');
  });
});

describe('buildContentMessages language instruction', () => {
  const base = { plan: 'p', angles: 'a', intel: 'i', platforms: ['facebook'], isCounter: false };

  it('tells the model to write all copy in the requested language', () => {
    const msgs = buildContentMessages({ ...base, language: 'Arabic' });
    expect(msgs[0]!.content).toContain('in Arabic');
    expect(msgs[0]!.content).toContain('URLs and brand names as-is');
  });

  it('adds no language instruction when unset (English default)', () => {
    const msgs = buildContentMessages(base);
    expect(msgs[0]!.content).not.toContain('Write ALL copy');
  });
});

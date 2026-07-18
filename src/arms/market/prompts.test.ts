import { describe, it, expect } from 'vitest';
import { buildMarketMessages } from './prompts.js';

describe('market prompt context', () => {
  it('includes website and social urls when the profile has them', () => {
    const msgs = buildMarketMessages(
      {
        industry: 'specialty coffee',
        audience: 'home brewers',
        website: 'https://aurora.coffee',
        socialUrls: { facebook: 'https://facebook.com/auroracoffee' },
      },
      'ctx',
    );
    const user = msgs.find((m) => m.role === 'user')!.content;
    expect(user).toContain('specialty coffee');
    expect(user).toContain('https://aurora.coffee');
    expect(user).toContain('https://facebook.com/auroracoffee');
  });

  it('omits the website/social lines when absent (no "unknown" noise)', () => {
    const msgs = buildMarketMessages({ industry: 'coffee' }, 'ctx');
    const user = msgs.find((m) => m.role === 'user')!.content;
    expect(user).not.toContain('Website');
    expect(user).not.toContain('Social pages');
  });
});

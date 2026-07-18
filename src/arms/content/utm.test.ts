import { describe, it, expect } from 'vitest';
import { applyUtm } from './utm.js';

describe('applyUtm (always-on, design §7.2)', () => {
  const campaign = 'camp-1';
  const draft = 'draft-9';

  it('adds utm_campaign and utm_content to a bare URL', () => {
    const out = applyUtm('Check https://aurora.coffee/menu today', campaign, draft);
    expect(out).toContain('https://aurora.coffee/menu?utm_campaign=camp-1&utm_content=draft-9');
  });

  it('appends with & when the URL already has a query string', () => {
    const out = applyUtm('https://aurora.coffee/menu?ref=x', campaign, draft);
    expect(out).toContain('https://aurora.coffee/menu?ref=x&utm_campaign=camp-1&utm_content=draft-9');
  });

  it('tags every URL in the text', () => {
    const out = applyUtm('a https://a.com b https://b.com/c', campaign, draft);
    expect(out).toContain('https://a.com?utm_campaign=camp-1&utm_content=draft-9');
    expect(out).toContain('https://b.com/c?utm_campaign=camp-1&utm_content=draft-9');
  });

  it('does not double-tag a URL that already has utm params', () => {
    const already = 'https://a.com?utm_campaign=camp-1&utm_content=draft-9';
    expect(applyUtm(already, campaign, draft)).toBe(already);
  });

  it('leaves text with no URLs unchanged', () => {
    expect(applyUtm('no links here', campaign, draft)).toBe('no links here');
  });
});

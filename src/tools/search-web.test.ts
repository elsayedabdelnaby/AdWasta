import { describe, it, expect, vi } from 'vitest';
import {
  BraveSearchProvider,
  TavilySearchProvider,
  SearxngSearchProvider,
  type HttpFetch,
} from './search-web.js';

function okJson(body: unknown): ReturnType<HttpFetch> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

describe('TavilySearchProvider', () => {
  it('POSTs to the Tavily search endpoint with a bearer key and the query in the body', async () => {
    const fetchImpl = vi.fn<HttpFetch>(() =>
      okJson({ results: [{ title: 'T', url: 'https://a.com', content: 'snippet body' }] }),
    );
    const provider = new TavilySearchProvider('tvly-key', fetchImpl);

    await provider.search('cold brew trends', { count: 5 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.tavily.com/search');
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['Authorization']).toBe('Bearer tvly-key');
    const body = JSON.parse(init!.body as string) as { query: string; max_results: number; search_depth: string };
    expect(body.query).toBe('cold brew trends');
    expect(body.max_results).toBe(5);
    // basic depth = 1 credit; never the pricey Research endpoint (design §12.3)
    expect(body.search_depth).toBe('basic');
  });

  it('maps Tavily results (content -> snippet) and derives citations from urls', async () => {
    const fetchImpl: HttpFetch = () =>
      okJson({
        results: [
          { title: 'A', url: 'https://a.com', content: 'aaa' },
          { title: 'B', url: 'https://b.com', content: 'bbb' },
        ],
      });
    const provider = new TavilySearchProvider('tvly-key', fetchImpl);

    const res = await provider.search('q');
    expect(res.results).toEqual([
      { title: 'A', url: 'https://a.com', snippet: 'aaa' },
      { title: 'B', url: 'https://b.com', snippet: 'bbb' },
    ]);
    expect(res.citations).toEqual(['https://a.com', 'https://b.com']);
  });

  it('throws with the status when Tavily rejects the key', async () => {
    const fetchImpl: HttpFetch = () => Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
    const provider = new TavilySearchProvider('bad', fetchImpl);
    await expect(provider.search('q')).rejects.toMatchObject({ status: 401 });
  });

  it('tolerates a missing results array', async () => {
    const fetchImpl: HttpFetch = () => okJson({});
    const provider = new TavilySearchProvider('tvly-key', fetchImpl);
    const res = await provider.search('q');
    expect(res.results).toEqual([]);
    expect(res.citations).toEqual([]);
  });
});

describe('SearxngSearchProvider (self-hosted, keyless)', () => {
  it('GETs the JSON search endpoint of the configured instance', async () => {
    const fetchImpl = vi.fn<HttpFetch>(() => okJson({ results: [] }));
    const provider = new SearxngSearchProvider('http://searxng:8080', fetchImpl);

    await provider.search('nitro cold brew');

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('http://searxng:8080/search');
    expect(url).toContain('format=json');
    expect(url).toContain('q=nitro%20cold%20brew');
  });

  it('trims a trailing slash on the base url', async () => {
    const fetchImpl = vi.fn<HttpFetch>(() => okJson({ results: [] }));
    const provider = new SearxngSearchProvider('http://searxng:8080/', fetchImpl);
    await provider.search('q');
    expect(fetchImpl.mock.calls[0]![0]).toContain('http://searxng:8080/search?');
  });

  it('maps results (content -> snippet) and derives citations from urls', async () => {
    const fetchImpl: HttpFetch = () =>
      okJson({
        results: [
          { title: 'A', url: 'https://a.com', content: 'aaa' },
          { title: 'B', url: 'https://b.com', content: 'bbb' },
        ],
      });
    const provider = new SearxngSearchProvider('http://searxng:8080', fetchImpl);

    const res = await provider.search('q');
    expect(res.results).toEqual([
      { title: 'A', url: 'https://a.com', snippet: 'aaa' },
      { title: 'B', url: 'https://b.com', snippet: 'bbb' },
    ]);
    expect(res.citations).toEqual(['https://a.com', 'https://b.com']);
  });

  it('caps the result count', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `https://x/${i}`, content: 'c' }));
    const fetchImpl: HttpFetch = () => okJson({ results: many });
    const provider = new SearxngSearchProvider('http://searxng:8080', fetchImpl);

    const res = await provider.search('q', { count: 3 });
    expect(res.results).toHaveLength(3);
  });

  it('throws with the status when the instance errors', async () => {
    const fetchImpl: HttpFetch = () => Promise.resolve({ ok: false, status: 502, json: async () => ({}) });
    const provider = new SearxngSearchProvider('http://searxng:8080', fetchImpl);
    await expect(provider.search('q')).rejects.toMatchObject({ status: 502 });
  });
});

describe('BraveSearchProvider (unchanged by the Tavily addition)', () => {
  it('GETs the Brave endpoint with the subscription-token header and maps description -> snippet', async () => {
    const fetchImpl = vi.fn<HttpFetch>(() =>
      okJson({ web: { results: [{ title: 'A', url: 'https://a.com', description: 'desc' }] } }),
    );
    const provider = new BraveSearchProvider('brave-key', fetchImpl);

    const res = await provider.search('coffee', { count: 3 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('https://api.search.brave.com/res/v1/web/search');
    expect(url).toContain('q=coffee');
    expect(init?.headers?.['X-Subscription-Token']).toBe('brave-key');
    expect(res.results).toEqual([{ title: 'A', url: 'https://a.com', snippet: 'desc' }]);
    expect(res.citations).toEqual(['https://a.com']);
  });
});

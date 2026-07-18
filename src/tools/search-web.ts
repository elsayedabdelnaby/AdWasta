// Web/SERP search behind a provider seam (design §12.3): Brave (Tier 0) / Tavily
// (Tier 1), or a fixture for offline tests. Never SerpAPI (budget, ADR-003).

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  citations: string[]; // result urls — snapshots REQUIRE these (design §12)
}

export interface SearchProvider {
  search(query: string, opts?: { count?: number }): Promise<SearchResponse>;
}

function toResponse(results: SearchResult[]): SearchResponse {
  return { results, citations: results.map((r) => r.url).filter(Boolean) };
}

/** Deterministic provider for tests/evals — keyed by query. */
export class FixtureSearchProvider implements SearchProvider {
  constructor(private readonly fixtures: Record<string, SearchResult[]> = {}) {}
  async search(query: string): Promise<SearchResponse> {
    return toResponse(this.fixtures[query] ?? this.fixtures['*'] ?? []);
  }
}

export interface HttpFetch {
  (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

/** Brave Search API provider ($5/1k, cheapest — §12.3). */
export class BraveSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: HttpFetch = globalThis.fetch as unknown as HttpFetch,
  ) {}

  async search(query: string, opts: { count?: number } = {}): Promise<SearchResponse> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${opts.count ?? 10}`;
    const res = await this.fetchImpl(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
    });
    if (!res.ok) throw Object.assign(new Error(`brave ${res.status}`), { status: res.status });
    const json = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
    const results = (json.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? '',
    }));
    return toResponse(results);
  }
}

/**
 * Tavily Search API provider (design §12.3). No-credit-card free tier (1k
 * credits/mo); an AI-native search that returns real source urls, so intel
 * snapshots keep honest citations. Uses `search_depth: 'basic'` (1 credit) —
 * never the pricey Research endpoint — to stay within the intel budget (§6.1).
 */
export class TavilySearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: HttpFetch = globalThis.fetch as unknown as HttpFetch,
  ) {}

  async search(query: string, opts: { count?: number } = {}): Promise<SearchResponse> {
    const res = await this.fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: opts.count ?? 10 }),
    });
    if (!res.ok) throw Object.assign(new Error(`tavily ${res.status}`), { status: res.status });
    const json = (await res.json()) as { results?: { title: string; url: string; content?: string }[] };
    const results = (json.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? '',
    }));
    return toResponse(results);
  }
}

/**
 * SearXNG provider (design §12.3) — a self-hosted, keyless metasearch engine
 * (docker: searxng/searxng). Zero marginal cost and no data leaves your infra;
 * results carry real source urls so intel citations stay honest. The instance
 * must have JSON output enabled (`search.formats: [html, json]`).
 */
export class SearxngSearchProvider implements SearchProvider {
  private readonly base: string;
  constructor(
    baseUrl: string,
    private readonly fetchImpl: HttpFetch = globalThis.fetch as unknown as HttpFetch,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  async search(query: string, opts: { count?: number } = {}): Promise<SearchResponse> {
    const url = `${this.base}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw Object.assign(new Error(`searxng ${res.status}`), { status: res.status });
    const json = (await res.json()) as { results?: { title: string; url: string; content?: string }[] };
    const results = (json.results ?? []).slice(0, opts.count ?? 10).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? '',
    }));
    return toResponse(results);
  }
}

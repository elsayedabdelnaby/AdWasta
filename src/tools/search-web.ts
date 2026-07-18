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
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
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

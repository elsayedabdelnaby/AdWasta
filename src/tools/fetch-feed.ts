// Conditional-GET RSS/Atom fetch (ADR-003). A 304 short-circuits with NO parse
// and NO LLM — this is what makes hourly Tier-0 polling effectively free.

export interface FeedItem {
  title: string;
  link?: string;
  snippet?: string;
}

export interface FeedFetchResult {
  status: 'not_modified' | 'ok' | 'error';
  httpStatus: number;
  etag?: string;
  lastModified?: string;
  items: FeedItem[];
  /** Concatenated title+snippet text, for fingerprinting (raw; not LLM-facing). */
  contentText: string;
}

export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface FetchFeedOpts {
  fetchImpl?: FetchLike;
  etag?: string;
  lastModified?: string;
}

function unescapeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function pick(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1] ? unescapeXml(m[1]) : undefined;
}

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = pick(block, 'title') ?? '';
    const link = pick(block, 'link');
    const snippet = pick(block, 'description') ?? pick(block, 'summary') ?? pick(block, 'content');
    items.push({ title, link, snippet });
  }
  return items;
}

export async function fetchFeed(url: string, opts: FetchFeedOpts = {}): Promise<FeedFetchResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers: Record<string, string> = {};
  if (opts.etag) headers['If-None-Match'] = opts.etag;
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;

  let res: FetchResponseLike;
  try {
    res = await fetchImpl(url, { headers });
  } catch {
    return { status: 'error', httpStatus: 0, items: [], contentText: '' };
  }

  if (res.status === 304) {
    // The whole point: no body, no parse, no LLM.
    return { status: 'not_modified', httpStatus: 304, items: [], contentText: '' };
  }
  if (res.status >= 400) {
    return { status: 'error', httpStatus: res.status, items: [], contentText: '' };
  }

  const xml = await res.text();
  const items = parseFeed(xml);
  const contentText = items.map((i) => `${i.title} ${i.snippet ?? ''}`.trim()).join('\n');
  return {
    status: 'ok',
    httpStatus: res.status,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
    items,
    contentText,
  };
}

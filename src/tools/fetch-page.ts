// Plain-page fetch for the tenant's own website (research context). The text
// is ALWAYS treated as untrusted: callers must pass it through
// sanitizeExternal before it reaches an LLM prompt (intel-arm does this for
// extraContext). Char-budgeted so a big homepage can't blow up the prompt.

export interface PageFetchResult {
  status: 'ok' | 'error';
  httpStatus: number;
  /** Readable text extracted from the HTML (truncated to maxChars). */
  text: string;
}

export type PageFetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface FetchPageOpts {
  fetchImpl?: PageFetchLike;
  /** Prompt budget; default keeps a homepage to a few thousand tokens. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 6000;

/** Strip scripts/styles/comments/tags and collapse whitespace to plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchPage(url: string, opts: FetchPageOpts = {}): Promise<PageFetchResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as PageFetchLike);
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  let res: { status: number; text(): Promise<string> };
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': 'AdWastaBot/1.0 (+research)' } });
  } catch {
    return { status: 'error', httpStatus: 0, text: '' };
  }
  if (res.status >= 400) {
    return { status: 'error', httpStatus: res.status, text: '' };
  }
  const html = await res.text();
  return { status: 'ok', httpStatus: res.status, text: htmlToText(html).slice(0, maxChars) };
}

import { sanitizeExternal } from '../guardrails/sanitize-external.js';
import type { FetchLike } from './fetch-feed.js';

// Fetch a competitor site/blog page (design §12 tier 1). robots.txt-respecting,
// HTML stripped, and sanitized before it can enter LLM context (§16).
export interface WebPage {
  url: string;
  ok: boolean;
  text: string; // stripped + sanitized
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FetchWebPageOpts {
  fetchImpl?: FetchLike;
  /** Injected robots.txt gate; default allows (real check wired per deployment). */
  robotsAllows?: (url: string) => Promise<boolean> | boolean;
}

export async function fetchWebPage(url: string, opts: FetchWebPageOpts = {}): Promise<WebPage> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const allowed = opts.robotsAllows ? await opts.robotsAllows(url) : true;
  if (!allowed) return { url, ok: false, text: '' };

  try {
    const res = await fetchImpl(url);
    if (res.status >= 400) return { url, ok: false, text: '' };
    const html = await res.text();
    return { url, ok: true, text: sanitizeExternal(stripHtml(html)) };
  } catch {
    return { url, ok: false, text: '' };
  }
}

import { describe, it, expect, vi } from 'vitest';
import { fetchFeed, type FetchLike } from './fetch-feed.js';

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>Cold brew launch</title><link>https://ex.com/1</link><description>New nitro line</description></item>
  <item><title>Summer hours</title><link>https://ex.com/2</link><description><![CDATA[Open till 9pm]]></description></item>
</channel></rss>`;

function res(status: number, body = '', headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => body,
  };
}

describe('fetchFeed — conditional GET (ADR-003)', () => {
  it('parses items and captures validators on 200', async () => {
    const fetchImpl: FetchLike = async () =>
      res(200, RSS, { etag: 'W/"abc"', 'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT' });
    const out = await fetchFeed('https://ex.com/feed', { fetchImpl });
    expect(out.status).toBe('ok');
    expect(out.items).toHaveLength(2);
    expect(out.items[0]!.title).toBe('Cold brew launch');
    expect(out.etag).toBe('W/"abc"');
    expect(out.contentText).toContain('nitro');
  });

  it('sends conditional headers and short-circuits on 304 with no parse', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => res(304));
    const out = await fetchFeed('https://ex.com/feed', {
      fetchImpl,
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
    });
    expect(out.status).toBe('not_modified');
    expect(out.items).toHaveLength(0);
    const passedHeaders = fetchImpl.mock.calls[0]![1]!.headers!;
    expect(passedHeaders['If-None-Match']).toBe('W/"abc"');
    expect(passedHeaders['If-Modified-Since']).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
  });

  it('returns error status on HTTP failure', async () => {
    const fetchImpl: FetchLike = async () => res(500);
    expect((await fetchFeed('https://ex.com/feed', { fetchImpl })).status).toBe('error');
  });
});

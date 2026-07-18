import { describe, it, expect } from 'vitest';
import { fetchPage, htmlToText, type PageFetchLike } from './fetch-page.js';

const page = (html: string, status = 200): PageFetchLike =>
  async () => ({ status, text: async () => html });

describe('htmlToText', () => {
  it('strips scripts, styles, comments, and tags down to readable text', () => {
    const html = `
      <html><head><style>body { color: red }</style>
      <script>alert('x')</script></head>
      <body><!-- nav --><h1>Mehrab Alquran</h1>
      <p>Handcrafted mihrab &amp; islamic decor.</p></body></html>`;
    expect(htmlToText(html)).toBe('Mehrab Alquran Handcrafted mihrab & islamic decor.');
  });
});

describe('fetchPage', () => {
  it('returns the page text on success', async () => {
    const res = await fetchPage('https://mehrab-alquran.com', {
      fetchImpl: page('<h1>Mehrab Alquran</h1><p>Prayer niches</p>'),
    });
    expect(res.status).toBe('ok');
    expect(res.text).toBe('Mehrab Alquran Prayer niches');
  });

  it('truncates long pages to the char budget', async () => {
    const res = await fetchPage('https://x.com', {
      fetchImpl: page(`<p>${'word '.repeat(5000)}</p>`),
      maxChars: 100,
    });
    expect(res.status).toBe('ok');
    expect(res.text.length).toBe(100);
  });

  it('reports http errors without throwing', async () => {
    const res = await fetchPage('https://x.com', { fetchImpl: page('nope', 500) });
    expect(res.status).toBe('error');
    expect(res.httpStatus).toBe(500);
    expect(res.text).toBe('');
  });

  it('reports network failures without throwing', async () => {
    const res = await fetchPage('https://x.com', {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(res.status).toBe('error');
    expect(res.httpStatus).toBe(0);
  });
});

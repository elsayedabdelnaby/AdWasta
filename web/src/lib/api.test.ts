import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

function mockFetch(status: number, body: string) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('createApi', () => {
  it('prefixes /api and attaches the x-dev-user header', async () => {
    const fetchFn = mockFetch(200, '{"ok":true}');
    const api = createApi(() => ({ user: 'demo-owner' }));
    await api.get('/tenants/abc/events');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/tenants/abc/events');
    expect((init as RequestInit).method).toBe('GET');
    expect((init!.headers as Record<string, string>)['x-dev-user']).toBe('demo-owner');
  });

  it('serializes a JSON body on POST', async () => {
    const fetchFn = mockFetch(200, '{}');
    const api = createApi(() => ({ user: 'u1' }));
    await api.post('/tenants/abc/onboard', { description: 'coffee' });

    const [, init] = fetchFn.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe('{"description":"coffee"}');
  });

  it('parses and returns the JSON response', async () => {
    mockFetch(200, '{"id":"t1"}');
    const api = createApi(() => ({ user: 'u1' }));
    await expect(api.get<{ id: string }>('/x')).resolves.toEqual({ id: 't1' });
  });

  it('returns an empty object when the body is empty', async () => {
    mockFetch(200, '');
    const api = createApi(() => ({ user: 'u1' }));
    await expect(api.post('/x')).resolves.toEqual({});
  });

  it('throws ApiError carrying the status on a non-2xx response', async () => {
    mockFetch(403, '{"error":"forbidden"}');
    const api = createApi(() => ({ user: 'stranger' }));
    const err = await api.get('/tenants/abc').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).body).toContain('forbidden');
  });

  it('omits x-dev-user when no user is set (prod cookie session)', async () => {
    const fetchFn = mockFetch(200, '{}');
    const api = createApi(() => ({ user: '' }));
    await api.get('/x');
    const [, init] = fetchFn.mock.calls[0]!;
    expect((init!.headers as Record<string, string>)['x-dev-user']).toBeUndefined();
  });
});

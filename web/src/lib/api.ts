// Thin fetch wrapper. Every call goes under the `/api` prefix (proxied to the
// API in both dev and prod) and carries the dev identity header. In production
// the WorkOS session cookie rides along automatically; `x-dev-user` is ignored
// by the WorkOS session provider, so the same client works against both.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'ApiError';
  }
}

export interface AuthContext {
  /** Dev identity sent as `x-dev-user` (AUTH_PROVIDER=dev). Empty in prod. */
  user: string;
  /** API base path; defaults to the `/api` proxy prefix. */
  base?: string;
}

export interface ApiClient {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
}

export function createApi(getAuth: () => AuthContext): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { user, base = '/api' } = getAuth();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-dev-user'] = user;
    const res = await fetch(base + path, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(res.status, text);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
  };
}

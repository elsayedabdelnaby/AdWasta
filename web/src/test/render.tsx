import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/Session';
import { ToastProvider } from '../components/Toast';

/** Renders a component inside the app's providers with an optional preset tenant. */
export function renderWithProviders(
  ui: ReactElement,
  opts: { tenantId?: string; user?: string; route?: string } = {},
) {
  if (opts.tenantId) localStorage.setItem('adwasta.tenantId', opts.tenantId);
  if (opts.user) localStorage.setItem('adwasta.user', opts.user);
  return render(
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <SessionProvider>
        <ToastProvider>{ui}</ToastProvider>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/**
 * Installs a fetch mock that routes by `METHOD path` (path without the `/api`
 * prefix). Handlers may return a plain object (200 JSON) or a { status, body }.
 */
export function mockApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = url.replace(/^\/api/, '');
    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else {
      body = init?.body; // binary uploads (Blob/File) pass through unparsed
    }
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    let handler = routes[key];
    if (handler === undefined) {
      // allow prefix matches for parameterized calls
      const match = Object.keys(routes).find((k) => key.startsWith(k));
      if (match) handler = routes[match];
    }
    if (handler === undefined) {
      return new Response('{"error":"unmocked"}', { status: 404 });
    }
    const result = typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler;
    if (result && typeof result === 'object' && 'status' in (result as object)) {
      const r = result as { status: number; body?: unknown };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }
    return new Response(JSON.stringify(result), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

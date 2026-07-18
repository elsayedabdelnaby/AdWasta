export interface ApiConfig {
  base: string;
  user: string;
  tenant: string;
}

const KEY = 'adwasta-cfg';

export function getConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ApiConfig;
  } catch {
    /* ignore */
  }
  return { base: 'http://localhost:3001', user: 'demo-owner', tenant: '' };
}

export function setConfig(cfg: ApiConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.base.replace(/\/$/, '')}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-user': cfg.user },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return data as T;
}

export const t = (path: string): string => `/tenants/${getConfig().tenant}${path}`;

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createApi, type ApiClient } from '../lib/api';

const USER_KEY = 'adwasta.user';
const TENANT_KEY = 'adwasta.tenantId';
const DEFAULT_USER = 'demo-owner';

export interface SessionValue {
  /** Dev identity (x-dev-user). Tenant is resolved from membership, never here. */
  user: string;
  /** The workspace the UI is scoped to. Persisted locally; not an auth claim. */
  tenantId: string | null;
  setUser(user: string): void;
  setTenantId(tenantId: string | null): void;
  api: ApiClient;
}

const SessionContext = createContext<SessionValue | null>(null);

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<string>(() => read(USER_KEY, DEFAULT_USER));
  const [tenantId, setTenantIdState] = useState<string | null>(() => {
    const v = read(TENANT_KEY, '');
    return v || null;
  });

  const setUser = useCallback((u: string) => {
    setUserState(u);
    try {
      localStorage.setItem(USER_KEY, u);
    } catch {
      /* private mode / storage disabled — keep in-memory value */
    }
  }, []);

  const setTenantId = useCallback((t: string | null) => {
    setTenantIdState(t);
    try {
      if (t) localStorage.setItem(TENANT_KEY, t);
      else localStorage.removeItem(TENANT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // The client closes over the latest user via the getter, so switching identity
  // never leaves a stale client behind.
  const api = useMemo(() => createApi(() => ({ user })), [user]);

  const value = useMemo<SessionValue>(
    () => ({ user, tenantId, setUser, setTenantId, api }),
    [user, tenantId, setUser, setTenantId, api],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

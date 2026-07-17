import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';

/** The authenticated caller. Identity only — tenant is resolved via membership. */
export interface Session {
  userId: string;
  email?: string;
}

/**
 * Verifies an incoming request's session. The ONLY provider-specific surface —
 * everything downstream (membership, RLS, 401/403) is our own logic (ADR-002),
 * so the provider swaps (dev/test ↔ WorkOS) with zero code change elsewhere.
 */
export interface SessionProvider {
  resolveSession(req: FastifyRequest): Promise<Session | null>;
}

/**
 * LOCAL/TEST ONLY. Trusts an `x-dev-user` header as the caller's identity.
 * Never selected in production (guarded by createSessionProvider + a NODE_ENV check).
 */
export class DevSessionProvider implements SessionProvider {
  async resolveSession(req: FastifyRequest): Promise<Session | null> {
    const userId = req.headers['x-dev-user'];
    if (typeof userId === 'string' && userId.trim().length > 0) {
      const email = req.headers['x-dev-email'];
      return { userId, email: typeof email === 'string' ? email : undefined };
    }
    return null;
  }
}

/**
 * Selects the SessionProvider from config. `workos` requires the WorkOS keys;
 * `dev` is refused in production so a misconfig can't silently trust headers.
 */
export async function createSessionProvider(config: AppConfig): Promise<SessionProvider> {
  if (config.AUTH_PROVIDER === 'workos') {
    const { WorkOsSessionProvider } = await import('./workos.js');
    return WorkOsSessionProvider.fromConfig(config);
  }
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_PROVIDER=dev is not allowed in production — set AUTH_PROVIDER=workos and provide WorkOS keys',
    );
  }
  return new DevSessionProvider();
}

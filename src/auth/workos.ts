import { WorkOS } from '@workos-inc/node';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { Session, SessionProvider } from './session-provider.js';

const SESSION_COOKIE = 'wos-session';

/**
 * Production SessionProvider (ADR-002). Verifies a WorkOS AuthKit sealed-session
 * cookie. Inert without keys — only constructed when AUTH_PROVIDER=workos, so the
 * whole Phase 0 gate runs against the dev provider with no account or network.
 */
export class WorkOsSessionProvider implements SessionProvider {
  constructor(
    private readonly workos: WorkOS,
    private readonly cookiePassword: string,
  ) {}

  static fromConfig(config: AppConfig): WorkOsSessionProvider {
    if (!config.WORKOS_API_KEY || !config.WORKOS_CLIENT_ID || !config.WORKOS_COOKIE_PASSWORD) {
      throw new Error(
        'AUTH_PROVIDER=workos requires WORKOS_API_KEY, WORKOS_CLIENT_ID and WORKOS_COOKIE_PASSWORD',
      );
    }
    const workos = new WorkOS(config.WORKOS_API_KEY, { clientId: config.WORKOS_CLIENT_ID });
    return new WorkOsSessionProvider(workos, config.WORKOS_COOKIE_PASSWORD);
  }

  async resolveSession(req: FastifyRequest): Promise<Session | null> {
    const sealed = req.cookies?.[SESSION_COOKIE];
    if (!sealed) return null;
    try {
      const session = this.workos.userManagement.loadSealedSession({
        sessionData: sealed,
        cookiePassword: this.cookiePassword,
      });
      const result = await session.authenticate();
      if (!result.authenticated) return null;
      return { userId: result.user.id, email: result.user.email };
    } catch {
      return null;
    }
  }
}

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import type { Db } from '../db/client.js';
import { registerHealthRoutes } from './routes/health.js';
import { createSessionProvider, type SessionProvider } from '../auth/session-provider.js';
import { makeAuthHooks, type AuthHooks } from '../auth/hook.js';
import { Vault } from '../credentials/vault.js';
import { EnvKeyProvider } from '../credentials/key-provider.js';
import { registerTenantRoutes } from './routes/tenants.js';
import { registerPlatformRoutes } from './routes/platforms.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerTraceRoutes } from './routes/traces.js';
import { registerEventRoutes } from './routes/events.js';
import type { Queue } from 'bullmq';
import type { ArmJobData } from '../queue/jobs.js';

export interface BuildAppDeps {
  config: AppConfig;
  db: Db;
  /** Inject a provider in tests; otherwise selected from config (dev/workos). */
  sessionProvider?: SessionProvider;
  /** Inject a vault in tests; otherwise built from the config KEK. */
  vault?: Vault;
  /** Job queue; when present the async job routes are registered. */
  jobQueue?: Queue<ArmJobData>;
  /** Redis handle for readiness checks + a distributed rate-limit store. */
  redis?: Redis;
  /** Per-tenant rate limit. Keyed by tenant (falls back to IP). */
  rateLimit?: { max: number; timeWindow: number | string };
}

/**
 * Assemble the Fastify app: cookie parsing, a Zod-aware error handler, the auth
 * hooks, and the route modules. Pure of process concerns (listen/signals) so it
 * can be exercised with app.inject() in tests.
 */
export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({ logger: config.NODE_ENV === 'development' });

  // Credentialed CORS restricted to a first-party allowlist. Reflecting an
  // arbitrary Origin here (origin: true) with credentials would let any site make
  // authenticated cross-site requests against the cookie session (CSRF/cred-read).
  const allowedOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => {
      // No Origin header = non-browser or same-origin (curl, server-to-server) —
      // not a credentialed cross-site read, so allow. Otherwise require allowlist.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });
  await app.register(cookie);

  if (deps.rateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: deps.rateLimit.max,
      timeWindow: deps.rateLimit.timeWindow,
      ...(deps.redis ? { redis: deps.redis } : {}),
      // Never throttle liveness/readiness — a shared proxy IP could otherwise get
      // health probes 429'd and flap the instance out of rotation.
      allowList: (req) => req.url === '/healthz' || req.url === '/readyz' || req.url === '/health',
      // Per-tenant bucket (ADR-002): the :id path param is present at onRequest;
      // fall back to authenticated user, then IP, for non-tenant routes.
      keyGenerator: (req) => {
        const p = req.params as { id?: string } | undefined;
        return req.tenantId ?? p?.id ?? req.session?.userId ?? req.ip;
      },
    });
  }

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', issues: err.issues });
    }
    if (typeof err.statusCode === 'number' && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  const provider = deps.sessionProvider ?? (await createSessionProvider(config));
  const hooks: AuthHooks = makeAuthHooks(db, provider);
  const vault = deps.vault ?? new Vault(db, new EnvKeyProvider(config.CREDENTIALS_MASTER_KEY));

  registerHealthRoutes(app, { db, redis: deps.redis, jobQueue: deps.jobQueue });
  registerTenantRoutes(app, { db, hooks });
  registerPlatformRoutes(app, { db, hooks, vault });
  registerTraceRoutes(app, { db, hooks });
  registerEventRoutes(app, { db, hooks });
  if (deps.jobQueue) {
    registerJobRoutes(app, { db, hooks, queue: deps.jobQueue });
  }

  return app;
}

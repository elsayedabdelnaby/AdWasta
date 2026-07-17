# Security runbook

Operational security procedures for AdWasta. Grows per phase; Phase 0 covers
tenant isolation, the credential vault, and infrastructure gates.

## Tenant isolation (design §7, ADR-002)

Two independent layers protect every tenant table:

1. **Authentication → identity.** Every route resolves the caller from the session
   (`SessionProvider`). `tenant_id` is derived from **membership**, never from a
   path parameter. `:id` routes verify the session is a member of `:id` (else 403);
   unauthenticated requests get 401.
2. **Postgres Row-Level Security.** The app connects as the non-superuser
   `app_user` role. Every tenant table has `ENABLE`/`FORCE ROW LEVEL SECURITY`
   with a `tenant_isolation` policy on `current_setting('app.tenant_id')`. With no
   tenant context the policy resolves to NULL → zero rows (fail closed).

**Critical operational rule:** the application role **must not** be a superuser and
**must not** have `BYPASSRLS`. A superuser silently ignores every policy. Verify:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
-- expect: app_user | f | f
```

Migrations run as the DB owner (`DATABASE_ADMIN_URL`); the app runs as `app_user`
(`DATABASE_URL`). Never serve requests through the owner connection.

`audit_log` is append-only: `app_user` is granted only `SELECT, INSERT` (UPDATE and
DELETE are revoked in the RLS migration).

## Credential vault — envelope encryption (design §11)

Secrets are encrypted with AES-256-GCM under a per-tenant **Data Encryption Key
(DEK)**. Each DEK is itself encrypted ("wrapped") with the master **Key Encryption
Key (KEK)**, `CREDENTIALS_MASTER_KEY`. Plaintext never leaves `src/credentials/` and
is never written to logs, events, or traces.

- **KEK:** base64 encoding of exactly 32 bytes. Generate with
  `openssl rand -base64 32`. Store in the platform secret manager — **never commit**.
- **`KeyProvider`** is the KMS seam: `EnvKeyProvider` today; an AWS KMS / Vault
  provider can replace it with no schema change.

### Rotation

| Operation | Effect | Method |
|-----------|--------|--------|
| **KEK rotation** | Re-wraps every tenant DEK from the old KEK to a new one. Credential ciphertext is untouched (cheap). | `Vault.rotateKek(newKek)` — then deploy with the new KEK as `CREDENTIALS_MASTER_KEY`. |
| **Per-tenant DEK rotation** | Generates a fresh DEK for one tenant and re-encrypts all of that tenant's credential rows under it. | `Vault.rotateTenantDek(tenantId)` |

**KEK rotation procedure:**

1. Generate the new KEK: `openssl rand -base64 32`.
2. With the process still on the **old** KEK, run `rotateKek(<newKek>)` (a one-off
   admin script / task). This re-wraps all DEK rows in a single pass.
3. Update `CREDENTIALS_MASTER_KEY` to the new value in the secret manager.
4. Redeploy. Verify a known credential still decrypts, then destroy the old KEK.

Rotate a KEK **immediately** if it is ever exposed (e.g. pasted into a notes file).

## Infrastructure gates (Phase 0 / design §23)

- **Per-tenant rate limiting.** `@fastify/rate-limit`, keyed by tenant (falling back
  to IP for non-tenant routes like `POST /tenants`). Backed by Redis in production
  for multi-instance correctness. `/healthz` and `/readyz` are exempt so probes are
  never throttled. **Behind a proxy/load balancer, enable Fastify `trustProxy`** so
  the IP fallback keys on the real client rather than the shared proxy address.
- **Health / readiness.** `/healthz` (liveness) and `/readyz` (probes Postgres,
  Redis, and BullMQ queue depth; returns 503 when a hard dependency is down).
- **Backups / PITR — deferred to deployment (ops task, not application code).**
  Use managed Postgres with point-in-time recovery, or self-host with pgBackRest +
  WAL archiving. This is a deploy-time infrastructure decision; there is no v1
  application code for it. Track it on the production checklist before go-live.

## Never

- Commit credentials or `.env` (`.gitignore` blocks `.env`; keep it that way).
- Log raw API keys, OAuth tokens, or session cookies — `sanitizeEventPayload`
  redacts secret-looking keys from every event/audit payload; do not bypass it.
- Serve tenant requests through the owner/superuser DB connection.

---
name: verify
description: Build, run, and drive AdWasta end-to-end (API + dashboard) to observe a change working.
---

# Verify AdWasta

Two surfaces: the Fastify API (`src/`, socket on :3001) and the Vite+React
dashboard (`web/`, GUI on :5173). Postgres + Redis run natively on localhost.

## Boot the API (:3001)

```bash
npm run build   # produces dist/ (tsc)
KEK="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
NODE_ENV=development AUTH_PROVIDER=dev PORT=3001 HOST=127.0.0.1 \
  DATABASE_URL="postgresql://app_user:app_user@localhost:5432/marketing_agent" \
  DATABASE_ADMIN_URL="postgresql://$(whoami)@localhost:5432/marketing_agent" \
  REDIS_URL="redis://localhost:6379" CREDENTIALS_MASTER_KEY="$KEK" \
  CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173" \
  node dist/index.js &
# wait: curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/healthz  -> 200
```

Gotchas:
- `AUTH_PROVIDER=dev` lets you authenticate by sending header `x-dev-user: <id>`
  (no WorkOS). It is refused in production.
- Migrations must be applied first: `DATABASE_ADMIN_URL=... npm run db:migrate`.
- CORS is a first-party allowlist — the dashboard origin MUST be in `CORS_ORIGINS`
  or the browser blocks credentialed requests. Use the Vite dev port (5173), which
  is in the default allowlist.

## Boot the dashboard (:5173)

```bash
npm install --prefix web        # first time only
npm run --prefix web dev &      # vite on http://localhost:5173
```

## Drive it (Playwright MCP)

Load the browser tools, then:
1. `browser_navigate` http://localhost:5173/ — nav + Connection panel render;
   "no tenant selected" guard shows until a tenant is set.
2. Click **Create tenant** — cross-origin POST /tenants (CORS + dev-auth +
   membership); the Dashboard then auto-loads cost + activity from the real API.
3. Navigate #approvals / #performance / #traces / #activity — each fetches its
   auth+RLS-scoped endpoint and renders (empty states for a fresh tenant).
4. LLM-driven pages (#campaign RESEARCH/STRATEGY/CREATION) need a real
   `OPENROUTER_API_KEY` on the API; without it they surface a fetch error — expected.

A `favicon.ico` 404 in the console is cosmetic (no favicon shipped), not a failure.

## Cleanup

```bash
pkill -f "node dist/index.js"; pkill -f "web dev"
psql -h localhost -U "$(whoami)" -d marketing_agent -c "DELETE FROM tenants WHERE name='Demo Co';"
```

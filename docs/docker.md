# Docker

Run the full stack locally or publish to any Docker host (VPS, Railway, Fly.io, AWS ECS, etc.).

## Services

| Service | Port (dev) | Role |
|---------|------------|------|
| `web` | 8080 | Control plane UI (nginx → API proxy) |
| `api` | 3001 | Fastify API + future Supervised Crew |
| `worker` | — | BullMQ jobs (wired in Phase 0 queue) |
| `db` | 5432 | PostgreSQL |
| `redis` | 6379 | Queues + schedules |

## Quick start

```bash
cd marketing-agent
cp .env.example .env
# Edit .env — set OPENROUTER_API_KEY and CREDENTIALS_MASTER_KEY

docker compose up --build
```

- UI: http://localhost:8080  
- API health: http://localhost:3001/health  

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- Exposes web on port **80** only  
- Postgres and Redis are **not** published to the host  

Set secrets via `.env` or your platform's secret manager. Never commit `.env`.

## OpenRouter in Docker

Pass through `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
MODEL_FAST=openai/gpt-4o-mini
MODEL_BALANCED=openai/gpt-4o
MODEL_DEEP=anthropic/claude-sonnet-4
```

## Publish checklist

1. Set strong `CREDENTIALS_MASTER_KEY` (`openssl rand -base64 32`)
2. Use managed Postgres/Redis in prod (or keep compose volumes backed up)
3. Put TLS in front of `web` (Caddy, Traefik, Cloudflare)
4. Run migrations after Phase 0 DB schema lands: `docker compose exec api npm run db:migrate`

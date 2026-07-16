import Fastify from 'fastify';
import cors from '@fastify/cors';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/health', async () => ({
  status: 'ok',
  service: 'marketing-agent-api',
  version: '0.1.0',
}));

app.get('/api/v1/meta', async () => ({
  architecture: 'supervised-crew',
  pillars: ['research', 'strategy', 'creation', 'ops'],
  crews: ['alex', 'sam', 'jordan', 'ops'],
  note: 'Control plane UI — Phase 9. API scaffold — Phase 0.',
}));

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

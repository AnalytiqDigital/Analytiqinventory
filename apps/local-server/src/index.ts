import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';

const HealthSchema = z.object({ status: z.literal('ok'), mode: z.literal('lan') });

export function buildServer() {
  const app = Fastify({ logger: true });
  void app.register(swagger, {
    openapi: { info: { title: 'AnalytIQ Local Server', version: '0.1.0' } },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/health', async () => HealthSchema.parse({ status: 'ok', mode: 'lan' }));
  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  void app.listen({ port, host: '0.0.0.0' });
}

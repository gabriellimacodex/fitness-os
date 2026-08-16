import { healthResponseSchema } from '@fitness-os/schemas';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

export function buildApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);

  app.get('/health', async () =>
    healthResponseSchema.parse({
      status: 'ok',
    }),
  );

  return app;
}

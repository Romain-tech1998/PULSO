import {
  directDistanceQuerySchema,
  eventListResponseSchema,
  mapBoundsQuerySchema
} from '@pulso/contracts';
import type { EventRepository } from '@pulso/database';
import Fastify from 'fastify';
import { ZodError } from 'zod';

export function buildApp(
  repository: EventRepository,
  options: { logger?: boolean } = {}
) {
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The request parameters are invalid.'
        }
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.'
      }
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/events', async (request) => {
    const bounds = mapBoundsQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findInBounds(bounds)
    });
  });

  app.get('/events/near', async (request) => {
    const query = directDistanceQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findWithinDirectDistance(query)
    });
  });

  return app;
}

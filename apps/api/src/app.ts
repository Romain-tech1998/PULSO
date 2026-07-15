import {
  directDistanceQuerySchema,
  eventDetailsResponseSchema,
  eventListResponseSchema,
  mapBoundsQuerySchema
} from '@pulso/contracts';
import type { EventRepository } from '@pulso/database';
import { createMontrealDiscoveryWindow } from '@pulso/domain';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';

const eventParamsSchema = z.object({ id: z.uuid() });

export function buildApp(
  repository: EventRepository,
  options: { logger?: boolean; now?: () => Date } = {}
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

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('access-control-allow-origin', '*');
    return payload;
  });

  app.get('/events', async (request) => {
    const bounds = mapBoundsQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findInBounds(
        bounds,
        createMontrealDiscoveryWindow(options.now?.() ?? new Date())
      )
    });
  });

  app.get('/events/:id', async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const event = await repository.findById(id);
    if (!event) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return eventDetailsResponseSchema.parse({ data: event });
  });

  app.get('/events/:id/external', async (request, reply) => {
    const { id } = eventParamsSchema.parse(request.params);
    const destination = await repository.findExternalDestination(id);
    if (
      !destination ||
      destination.status !== 'available' ||
      destination.eventStatus === 'cancelled'
    ) {
      return reply.status(409).send({
        error: {
          code: 'DESTINATION_UNAVAILABLE',
          message: 'The external destination is currently unavailable.'
        }
      });
    }
    const url = new URL(destination.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return reply.status(409).send({
        error: {
          code: 'DESTINATION_UNAVAILABLE',
          message: 'The external destination is currently unavailable.'
        }
      });
    }
    return reply.redirect(url.toString());
  });

  app.get('/events/near', async (request) => {
    const query = directDistanceQuerySchema.parse(request.query);
    return eventListResponseSchema.parse({
      data: await repository.findWithinDirectDistance(query)
    });
  });

  return app;
}

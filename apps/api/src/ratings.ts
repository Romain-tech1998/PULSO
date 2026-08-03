import {
  myVenueRatingResponseSchema,
  setVenueRatingRequestSchema,
  venueIdsQuerySchema,
  venueRatingSummariesResponseSchema
} from '@pulso/contracts';
import type { AuthRepository, RatingsRepository } from '@pulso/database';
import { VenueNotFoundError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const venueParamsSchema = z.object({ venueId: z.uuid() });

// Internal-only venue quality signal (any signed-in user, 1-5 stars, an
// optional comment) - see packages/contracts for the "why" of the schema
// shape. Writing/reading your own rating requires sign-in; the batched
// average below is a page enrichment like /venues/favorite-counts, so it
// stays open to an anonymous caller too.
export function registerRatingsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  ratingsRepository: RatingsRepository
) {
  app.put('/venues/:venueId/rating', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { venueId } = venueParamsSchema.parse(request.params);
    const { rating, comment } = setVenueRatingRequestSchema.parse(request.body);
    try {
      await ratingsRepository.setRating(user.id, venueId, rating, comment);
    } catch (error) {
      if (error instanceof VenueNotFoundError) {
        return reply.status(404).send({
          error: { code: 'VENUE_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/venues/:venueId/rating', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { venueId } = venueParamsSchema.parse(request.params);
    await ratingsRepository.clearRating(user.id, venueId);
    return reply.status(204).send();
  });

  app.get('/venues/:venueId/rating', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { venueId } = venueParamsSchema.parse(request.params);
    const rating = await ratingsRepository.getMyRating(user.id, venueId);
    return myVenueRatingResponseSchema.parse({ data: rating ?? null });
  });

  app.get('/venues/ratings', async (request) => {
    const { ids } = venueIdsQuerySchema.parse(request.query);
    const summaries = await ratingsRepository.getAverageRatingsForVenues(ids);
    return venueRatingSummariesResponseSchema.parse({
      data: ids
        .filter((venueId) => summaries.has(venueId))
        .map((venueId) => {
          const summary = summaries.get(venueId)!;
          return {
            venueId,
            average: summary.average,
            count: summary.count
          };
        })
    });
  });
}

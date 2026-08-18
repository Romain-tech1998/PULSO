import {
  eventAccessRequestSchema,
  eventAccessRequestsResponseSchema,
  resolveEventAccessRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  EventAccessRepository,
  EventRepository,
  NotificationsRepository
} from '@pulso/database';
import {
  CannotRequestOwnEventError,
  EventAccessDeclinedError,
  EventNotOnApprovalError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const requesterParamsSchema = z.object({
  eventId: z.uuid(),
  userId: z.uuid()
});

/**
 * DEC-0022 §6. Requesting the exact location of an event whose organizer
 * withheld it, and the organizer's decision on that request.
 *
 * Nothing here serves an address. The disclosure happens entirely in
 * `publicEventSelect`, which reads `event_access_requests` on every event
 * query - these routes only write the row that query consults. That
 * separation is deliberate: a route that returned the address directly would
 * be a second place to get the authorization right.
 */
export function registerEventAccessRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  eventAccessRepository: EventAccessRepository,
  eventRepository: EventRepository,
  notificationsRepository: NotificationsRepository
) {
  app.post('/events/:eventId/access-request', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const { message } = eventAccessRequestSchema.parse(request.body ?? {});

    let status;
    try {
      status = await eventAccessRepository.request(eventId, user.id, message);
    } catch (error) {
      if (error instanceof EventNotOnApprovalError) {
        // Also the answer for an event that does not exist. The two are
        // deliberately indistinguishable: a 404 here would confirm which
        // event ids are private afters.
        return reply.status(404).send({
          error: {
            code: 'EVENT_NOT_FOUND',
            message: 'The event was not found.'
          }
        });
      }
      if (error instanceof CannotRequestOwnEventError) {
        return reply.status(409).send({
          error: {
            code: 'ALREADY_ORGANIZER',
            message: 'You are the organizer of this event.'
          }
        });
      }
      if (error instanceof EventAccessDeclinedError) {
        return reply.status(409).send({
          error: {
            code: 'ACCESS_DECLINED',
            message: 'This organizer has declined this request.'
          }
        });
      }
      throw error;
    }

    // Only a genuinely new request notifies. Re-posting an existing pending
    // request is idempotent and must not re-ping the organizer, which would
    // make the button a way to spam them.
    if (status === 'pending') {
      const organizerId = await eventAccessRepository.findOrganizerId(eventId);
      if (organizerId) {
        await notificationsRepository.notifyEventAccessRequested(
          organizerId,
          user.id,
          eventId
        );
      }
    }
    return reply.status(201).send({ data: { status } });
  });

  app.get('/me/events/:eventId/access-requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const organizerId = await eventAccessRepository.findOrganizerId(eventId);
    if (organizerId !== user.id) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return eventAccessRequestsResponseSchema.parse({
      data: await eventAccessRepository.list(eventId)
    });
  });

  app.put(
    '/me/events/:eventId/access-requests/:userId',
    async (request, reply) => {
      const user = await resolveBearerUser(request, authRepository);
      if (!user) return sendUnauthenticated(reply);
      const { eventId, userId } = requesterParamsSchema.parse(request.params);
      const { decision } = resolveEventAccessRequestSchema.parse(request.body);

      const organizerId = await eventAccessRepository.findOrganizerId(eventId);
      if (organizerId !== user.id) {
        return reply.status(404).send({
          error: {
            code: 'EVENT_NOT_FOUND',
            message: 'The event was not found.'
          }
        });
      }

      const resolved = await eventAccessRepository.resolve(
        eventId,
        userId,
        decision,
        user.id
      );
      if (!resolved) {
        // Either there is no request, or it is a declined one someone is
        // trying to approve - which DEC-0022 acceptance criterion 11 makes
        // final. Both are "there is nothing here to decide".
        return reply.status(409).send({
          error: {
            code: 'REQUEST_NOT_PENDING',
            message: 'There is no request to decide.'
          }
        });
      }
      await notificationsRepository.notifyEventAccessResolved(
        userId,
        eventId,
        decision === 'approved'
      );
      // Read back as the organizer so the response carries the event they
      // still see in full, rather than the redacted view.
      const event = await eventRepository.findById(eventId, user.id);
      return { data: { decision, ...(event ? { event } : {}) } };
    }
  );

  // The organizer's badge: how many people are waiting across all their
  // events. Cheap enough to sit next to the notification count.
  app.get('/me/access-requests/pending-count', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    return {
      data: {
        count: await eventAccessRepository.countPendingForOrganizer(user.id)
      }
    };
  });
}

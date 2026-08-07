import {
  createOrganizerRequestSchema,
  myOrganizerStatusResponseSchema,
  organizerRequestsResponseSchema,
  resolveOrganizerRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  NotificationsRepository,
  OrganizerRepository
} from '@pulso/database';
import { OrganizerRequestExistsError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const requestParamsSchema = z.object({ id: z.uuid() });

/**
 * DEC-0018. Requesting organizer status, and the administration queue that
 * resolves it.
 *
 * Administration is gated on `users.is_admin`, which is set directly in the
 * database - there is deliberately no route that grants it, because an
 * escalation path reachable from the product is a privilege-escalation
 * surface.
 */
export function registerOrganizerRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  organizerRepository: OrganizerRepository,
  notificationsRepository: NotificationsRepository
) {
  app.get('/me/organizer', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    return myOrganizerStatusResponseSchema.parse({
      data: await organizerRepository.getStatus(user.id)
    });
  });

  app.post('/me/organizer/requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = createOrganizerRequestSchema.parse(request.body);
    try {
      await organizerRepository.createRequest(
        user.id,
        body.venueId,
        body.justification
      );
    } catch (error) {
      if (error instanceof OrganizerRequestExistsError) {
        return reply.status(409).send({
          error: { code: 'ORGANIZER_REQUEST_EXISTS', message: error.message }
        });
      }
      throw error;
    }
    await notificationsRepository.notifyOrganizerRequestReceived(
      await organizerRepository.listAdminUserIds(),
      user.id,
      body.venueId
    );
    return reply.status(201).send();
  });

  app.get('/admin/organizer-requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    return organizerRequestsResponseSchema.parse({
      data: await organizerRepository.listPendingRequests()
    });
  });

  app.post('/admin/organizer-requests/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { id } = requestParamsSchema.parse(request.params);
    const { approve } = resolveOrganizerRequestSchema.parse(request.body);
    const resolved = await organizerRepository.resolveRequest(
      user.id,
      id,
      approve
    );
    if (!resolved) {
      return reply.status(404).send({
        error: {
          code: 'ORGANIZER_REQUEST_NOT_FOUND',
          message: 'The request was not found.'
        }
      });
    }
    await notificationsRepository.notifyOrganizerRequestResolved(
      resolved.requester.id,
      resolved.venueId,
      approve
    );
    return reply.status(204).send();
  });
}

// 403 rather than 404: the caller is authenticated, and the route's
// existence is not a secret - only its contents are.
function sendForbidden(reply: Parameters<typeof sendUnauthenticated>[0]) {
  return reply.status(403).send({
    error: {
      code: 'FORBIDDEN',
      message: 'This action requires an administrator account.'
    }
  });
}

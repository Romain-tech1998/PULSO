import {
  adminVenuePhotosResponseSchema,
  adminGroupPlacementsResponseSchema,
  adminGroupSummariesResponseSchema,
  createGroupPlacementRequestSchema,
  createOrganizerRequestSchema,
  eventListResponseSchema,
  groupVerificationRequestsResponseSchema,
  myOrganizerStatusResponseSchema,
  organizerRequestsResponseSchema,
  resolveGroupVerificationSchema,
  resolveOrganizerRequestSchema,
  suppressVenuePhotoRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  EventRepository,
  GroupsRepository,
  NotificationsRepository,
  OrganizerRepository
} from '@pulso/database';
import { OrganizerRequestExistsError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const requestParamsSchema = z.object({ id: z.uuid() });
const venueParamsSchema = z.object({ venueId: z.uuid() });
const groupParamsSchema = z.object({ id: z.uuid() });
const photoQuerySchema = z.object({ query: z.string().min(1).optional() });

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
  notificationsRepository: NotificationsRepository,
  // DEC-0019's venue-photo queue lives in the same console and behind the
  // same `is_admin` gate, so it is registered here rather than growing a
  // second admin module with its own copy of the authorization check.
  eventRepository?: EventRepository,
  groupsRepository?: GroupsRepository
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

  if (!eventRepository) return;

  /**
   * DEC-0019. The venue photos Pulso currently shows, borrowed ones first.
   *
   * This queue exists because most venue photos are not Pulso's: they are the
   * preview image a business publishes about itself, hotlinked. Answering
   * "please stop using our picture" has to be something the administrator
   * handling the request can do here, in the minute they read it - not a
   * shell command someone else has to be found to run.
   */
  app.get('/admin/venue-photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { query } = photoQuerySchema.parse(request.query);
    return adminVenuePhotosResponseSchema.parse({
      data: await eventRepository.listVenuePhotos(query)
    });
  });

  app.post('/admin/venue-photos/:venueId/suppress', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { venueId } = venueParamsSchema.parse(request.params);
    const body = suppressVenuePhotoRequestSchema.parse(request.body ?? {});
    const suppressed = await eventRepository.suppressVenuePhoto(venueId, {
      ...(body.thisOneOnly !== undefined
        ? { thisOneOnly: body.thisOneOnly }
        : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {})
    });
    if (!suppressed) {
      return reply.status(404).send({
        error: { code: 'VENUE_NOT_FOUND', message: 'The venue was not found.' }
      });
    }
    return reply.status(204).send();
  });

  app.delete(
    '/admin/venue-photos/:venueId/suppress',
    async (request, reply) => {
      const user = await resolveBearerUser(request, authRepository);
      if (!user) return sendUnauthenticated(reply);
      if (!(await organizerRepository.isAdmin(user.id))) {
        return sendForbidden(reply);
      }
      const { venueId } = venueParamsSchema.parse(request.params);
      await eventRepository.restoreVenuePhoto(venueId);
      // 204 whether or not a suppression existed: "this venue is not suppressed"
      // is the state the caller asked for, and reporting 404 for an already-lifted
      // one would make a retry look like a failure.
      return reply.status(204).send();
    }
  );

  // Finding the event to place. Deliberately a wide forward window rather
  // than the discovery default: a package is usually sold weeks before the
  // night it advertises, and an administrator searching for it should not
  // have to know how far ahead Pulso happens to look today.
  app.get('/admin/events/search', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { query } = photoQuerySchema.parse(request.query);
    if (!query) return eventListResponseSchema.parse({ data: [] });
    const now = new Date();
    const events = await eventRepository.searchEvents(
      // An empty category list means "do not filter by category" (the
      // repository binds it as NULL). Listing every category instead was
      // both redundant and fragile: it cast the whole enum on every call,
      // so one value missing from the database took the route down.
      { text: query, categories: [], price: 'all' },
      {
        startsAt: now,
        endsAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
      }
    );
    return eventListResponseSchema.parse({ data: events.slice(0, 25) });
  });

  if (!groupsRepository) return;

  /**
   * DEC-0015 §Future monetization. A venue buys a package, an administrator
   * places its event at the top of a relevant group's "Organiser" tab.
   *
   * There is deliberately no self-serve route: the sale happens outside the
   * product, and a path that let a venue place its own banner would be an
   * unpriced way into every community on Pulso.
   */
  app.get('/admin/group-placements', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    return adminGroupPlacementsResponseSchema.parse({
      data: await groupsRepository.listAllPlacements()
    });
  });

  app.post('/admin/group-placements', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const body = createGroupPlacementRequestSchema.parse(request.body);
    try {
      await groupsRepository.createPlacement({
        groupId: body.groupId,
        eventId: body.eventId,
        sponsorName: body.sponsorName,
        message: body.message,
        endsAt: body.endsAt,
        placedBy: user.id
      });
    } catch {
      return reply.status(404).send({
        error: {
          code: 'GROUP_OR_EVENT_NOT_FOUND',
          message: 'That group or event does not exist.'
        }
      });
    }
    return reply.status(201).send();
  });

  // Finding the group to place into. Private crews are excluded by the
  // repository: they are invisible by design and are not inventory.
  app.get('/admin/groups', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { query } = photoQuerySchema.parse(request.query);
    return adminGroupSummariesResponseSchema.parse({
      data: await groupsRepository.searchGroups(query ?? '')
    });
  });

  /**
   * DEC-0013/DEC-0015 group verification. A verified badge is what makes a
   * community legible to people who have never heard of it, so granting it
   * is an administrator decision, not something a group can award itself.
   * Same queue, same is_admin gate and same notify-on-decision shape as
   * the organizer requests above.
   */
  app.get('/admin/group-verifications', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    return groupVerificationRequestsResponseSchema.parse({
      data: await groupsRepository.listPendingVerifications()
    });
  });

  app.post('/admin/group-verifications/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { id } = groupParamsSchema.parse(request.params);
    const { approve } = resolveGroupVerificationSchema.parse(request.body);
    const resolved = await groupsRepository.resolveVerification(
      user.id,
      id,
      approve
    );
    if (!resolved) {
      return reply.status(404).send({
        error: {
          code: 'GROUP_VERIFICATION_NOT_FOUND',
          message: 'No pending verification request for this group.'
        }
      });
    }
    await notificationsRepository.notifyGroupVerificationResolved(
      resolved.requesterId,
      resolved.groupId,
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

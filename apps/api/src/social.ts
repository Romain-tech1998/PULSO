import {
  friendCodeResponseSchema,
  friendRequestsResponseSchema,
  friendsAttendingResponseSchema,
  friendsResponseSchema,
  myAttendanceResponseSchema,
  respondFriendRequestSchema,
  sendFriendRequestSchema,
  setAttendanceRequestSchema
} from '@pulso/contracts';
import type { AttendanceRepository, AuthRepository, FriendsRepository } from '@pulso/database';
import {
  CannotFriendSelfError,
  EventNotFoundError,
  FriendCodeNotFoundError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const requestParamsSchema = z.object({ id: z.uuid() });
const friendParamsSchema = z.object({ friendUserId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });

/**
 * Registers the friends and participation-visibility surface of the
 * account layer. Only called when the account layer itself is active (see
 * app.ts) - like every other /me route, this simply doesn't exist when
 * Google credentials aren't configured.
 */
export function registerSocialRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  friendsRepository: FriendsRepository,
  attendanceRepository: AttendanceRepository
) {
  app.get('/me/friend-code', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const friendCode = await friendsRepository.getFriendCode(user.id);
    return friendCodeResponseSchema.parse({ data: { friendCode } });
  });

  app.post('/me/friends/requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = sendFriendRequestSchema.parse(request.body);
    try {
      await friendsRepository.sendRequest(user.id, body.friendCode);
    } catch (error) {
      if (error instanceof FriendCodeNotFoundError) {
        return reply.status(404).send({
          error: { code: 'FRIEND_CODE_NOT_FOUND', message: error.message }
        });
      }
      if (error instanceof CannotFriendSelfError) {
        return reply.status(400).send({
          error: { code: 'CANNOT_FRIEND_SELF', message: error.message }
        });
      }
      if (error instanceof FriendshipAlreadyExistsError) {
        return reply.status(409).send({
          error: { code: 'FRIENDSHIP_ALREADY_EXISTS', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.get('/me/friends/requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const requests = await friendsRepository.getPendingRequests(user.id);
    return friendRequestsResponseSchema.parse({ data: requests });
  });

  app.put('/me/friends/requests/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = requestParamsSchema.parse(request.params);
    const { action } = respondFriendRequestSchema.parse(request.body);
    try {
      await friendsRepository.respondToRequest(user.id, id, action);
    } catch (error) {
      if (error instanceof FriendRequestNotFoundError) {
        return reply.status(404).send({
          error: { code: 'FRIEND_REQUEST_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.get('/me/friends', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const friends = await friendsRepository.getFriends(user.id);
    return friendsResponseSchema.parse({ data: friends });
  });

  app.delete('/me/friends/:friendUserId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    await friendsRepository.removeFriend(user.id, friendUserId);
    return reply.status(204).send();
  });

  app.put('/me/attendance/:eventId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const { visibility } = setAttendanceRequestSchema.parse(request.body);
    try {
      await attendanceRepository.setAttendance(user.id, eventId, visibility);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({
          error: { code: 'EVENT_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/me/attendance/:eventId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    await attendanceRepository.clearAttendance(user.id, eventId);
    return reply.status(204).send();
  });

  app.get('/me/attendance', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const attendance = await attendanceRepository.getMyAttendance(user.id);
    return myAttendanceResponseSchema.parse({ data: attendance });
  });

  // Registered under the account guard rather than the public /events
  // routes (it doesn't exist at all unless Google is configured, like the
  // rest of this file) - but unlike every other route here, an anonymous
  // caller gets an empty list rather than 401. This is an enrichment for
  // Event Details, not an account action; there's no meaningful "friends
  // attending" for a viewer with no session, but that's not an error case
  // worth interrupting the page over.
  app.get('/events/:eventId/friends-attending', async (request) => {
    const user = await resolveBearerUser(request, authRepository);
    const { eventId } = eventParamsSchema.parse(request.params);
    const friends = user
      ? await attendanceRepository.getFriendsAttending(user.id, eventId)
      : [];
    return friendsAttendingResponseSchema.parse({ data: friends });
  });
}
